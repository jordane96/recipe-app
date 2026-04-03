/**
 * Merge qualitative override export (same shape as localStorage) into
 * scripts/recipeIngredientSections.mjs, then run: npm run data:publish
 *
 * Usage: node scripts/apply-qualitative-overrides-to-sections.mjs <path-to-export.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SECTIONS_FILE = join(__dirname, "recipeIngredientSections.mjs");

const exportPath = process.argv[2];
if (!exportPath) {
  console.error(
    "Usage: node scripts/apply-qualitative-overrides-to-sections.mjs <export.json>",
  );
  process.exit(1);
}

let overrides;
try {
  overrides = JSON.parse(readFileSync(exportPath, "utf8"));
} catch (e) {
  console.error("Failed to read or parse JSON:", e.message);
  process.exit(1);
}

if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
  console.error("Expected a JSON object: { [stableLineKey]: { amount, unit } }");
  process.exit(1);
}

const url = `${pathToFileURL(SECTIONS_FILE).href}?t=${Date.now()}`;
const { SECTIONS } = await import(url);
const next = structuredClone(SECTIONS);

/** @param {string} key */
function parseStableLineKey(key) {
  const parts = key.split("\n");
  if (parts.length < 4) {
    return null;
  }
  return {
    recipeId: parts[0],
    sectionName: parts[1],
    ingredientId: parts[2],
    note: parts.slice(3).join("\n"),
  };
}

let applied = 0;
/** @type {Array<{ key: string; reason: string }>} */
const skipped = [];

for (const [key, val] of Object.entries(overrides)) {
  if (
    !val ||
    typeof val !== "object" ||
    typeof val.amount !== "number" ||
    !Number.isFinite(val.amount) ||
    typeof val.unit !== "string" ||
    !val.unit.trim()
  ) {
    skipped.push({ key, reason: "invalid amount/unit" });
    continue;
  }
  const parsed = parseStableLineKey(key);
  if (!parsed) {
    skipped.push({ key, reason: "key must be 4+ newline-separated parts" });
    continue;
  }
  const { recipeId, sectionName, ingredientId, note } = parsed;
  const noteNorm = note.trim();
  const recipeSecs = next[recipeId];
  if (!recipeSecs) {
    skipped.push({ key, reason: `unknown recipeId: ${recipeId}` });
    continue;
  }
  const sec = recipeSecs.find((s) => s.name === sectionName);
  if (!sec) {
    skipped.push({ key, reason: `unknown section: ${sectionName}` });
    continue;
  }
  const line = sec.lines.find(
    (l) =>
      l.ingredientId === ingredientId &&
      (l.note ?? "").trim() === noteNorm,
  );
  if (!line) {
    skipped.push({ key, reason: "no matching line" });
    continue;
  }
  line.amount = val.amount;
  line.unit = val.unit.trim();
  applied++;
}

const header = `/** @typedef {{ ingredientId: string, amount: number|null, unit: string|null, note?: string }} L */
/** @typedef {{ name: string, lines: L[] }} S */

/** @type {Record<string, S[]>} */
export const SECTIONS = `;

if (applied === 0) {
  const n = Object.keys(overrides).length;
  if (n === 0) {
    console.log("Export file has no keys; recipeIngredientSections.mjs not modified.");
    process.exit(0);
  }
  console.error(
    "No matching lines were updated; recipeIngredientSections.mjs not modified.",
  );
  process.exit(1);
}

const body = JSON.stringify(next, null, 2);
writeFileSync(SECTIONS_FILE, `${header}${body};\n`, "utf8");

console.log(`Wrote ${applied} line(s) into recipeIngredientSections.mjs`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} entr(y/ies):`);
  for (const s of skipped.slice(0, 30)) {
    const preview = s.key.length > 72 ? `${s.key.slice(0, 72)}…` : s.key;
    console.log(`  - ${s.reason}: ${preview.replace(/\n/g, "\\n")}`);
  }
  if (skipped.length > 30) {
    console.log(`  … and ${skipped.length - 30} more`);
  }
}
console.log("Next: npm run data:publish");
