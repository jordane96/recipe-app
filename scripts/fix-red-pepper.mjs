/**
 * One-off data pass: split the conflated "red pepper" ingredient.
 *
 * `red-pepper` is named **"Red pepper (spice or veg)"** in the catalog — the name itself admits
 * it stands for two unrelated groceries: crushed red pepper flakes (a staple spice, measured in
 * teaspoons) and a red bell pepper (produce, bought by the each). One id can't be both: it is
 * flagged `staple` so it's kept off the shopping list, which is right for flakes and wrong for a
 * pepper you actually have to buy, and it sorts into Spices, which sends you to the wrong aisle.
 *
 * The recipe data settles which sense is actually in use: exactly one line references
 * `red-pepper` — `sausage-pasta`, 1 tsp — which is unambiguously the flakes. So:
 *
 *   1. `red-pepper` is renamed to **"Red pepper flakes"** (unit/category/staple already correct
 *      for that sense, and the one existing line stays valid — no recipe rewrite needed).
 *   2. The vegetable sense is served by the existing **`bell-pepper`** row (count / produce, not
 *      a staple). This script only *verifies* it — no colour-specific duplicate is added, since
 *      an unused row is another thing to keep correct for no present benefit.
 *
 * Usage (mirrors scripts/fix-ingredient-units.mjs):
 *   node scripts/fix-red-pepper.mjs           # dry run — prints the plan, writes nothing
 *   node scripts/fix-red-pepper.mjs --apply   # writes to .env.local's DATABASE_URL (dev branch)
 *   node scripts/fix-red-pepper.mjs --prod --apply   # writes to production
 *
 * See the "Environments" note in CLAUDE.md: `.env.local` points at a Neon *test* branch, so a
 * plain `--apply` does NOT touch production.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envFile = resolve(root, ".env.local");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const APPLY = process.argv.includes("--apply");
const PROD = process.argv.includes("--prod");

/** Production URL lives as a commented line in `.env.local`, same convention as the units fix. */
function productionUrl() {
  const line = readFileSync(envFile, "utf-8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l));
  const m = line && line.match(/DATABASE_URL="([^"]+)"/);
  if (!m) throw new Error("No commented production DATABASE_URL found in .env.local");
  return m[1];
}

const connection = PROD ? productionUrl() : process.env.DATABASE_URL;
if (!connection) throw new Error("No DATABASE_URL — run `vercel env pull .env.local` first.");
const sql = neon(connection);

const OLD_ID = "red-pepper";
const NEW_NAME = "Red pepper flakes";
/** The vegetable sense. Expected to already exist — verified, never created. */
const BELL = { id: "bell-pepper", unit: "count", category: "produce" };

async function main() {
  console.log(`Target: ${PROD ? "PRODUCTION" : "development (.env.local)"}`);
  console.log(APPLY ? "Mode:   APPLY\n" : "Mode:   dry run (no writes)\n");

  const [existing] = await sql`SELECT * FROM ingredients WHERE id = ${OLD_ID}`;
  if (!existing) {
    console.log(`- ${OLD_ID}: not present, nothing to rename.`);
  } else if (existing.name === NEW_NAME) {
    console.log(`- ${OLD_ID}: already named "${NEW_NAME}".`);
  } else {
    console.log(`- rename ${OLD_ID}: "${existing.name}" → "${NEW_NAME}"`);
    if (APPLY) {
      await sql`UPDATE ingredients SET name = ${NEW_NAME} WHERE id = ${OLD_ID}`;
    }
  }

  // Verify only. If the vegetable row is missing or miscategorised the rename above would leave
  // no home for "a red pepper", so this is worth failing loudly about rather than assuming.
  const [bell] = await sql`SELECT id, name, unit, category FROM ingredients WHERE id = ${BELL.id}`;
  if (!bell) {
    console.log(`- ${BELL.id}: MISSING — the vegetable sense has nowhere to go. Add it before shipping.`);
  } else if (bell.unit !== BELL.unit || bell.category !== BELL.category) {
    console.log(
      `- ${BELL.id}: present but ${bell.unit}/${bell.category}; expected ${BELL.unit}/${BELL.category}.`,
    );
  } else {
    console.log(`- ${BELL.id}: "${bell.name}" (${bell.unit} / ${bell.category}) — already correct, untouched.`);
  }

  // Recipe lines are untouched on purpose: the single `red-pepper` line means flakes, and
  // renaming the ingredient keeps that line correct. Report anything that would need review.
  const users = await sql`
    SELECT DISTINCT r.id, r.title
    FROM recipes r
    JOIN ingredient_sections s ON s.recipe_id = r.id
    JOIN ingredient_lines l ON l.section_id = s.id
    WHERE l.ingredient_id = ${OLD_ID}
    ORDER BY r.title
  `;
  console.log(
    users.length === 0
      ? "\nNo recipes reference red-pepper."
      : `\nRecipes now reading "${NEW_NAME}" (verify each is the spice, not the vegetable):`,
  );
  for (const r of users) console.log(`   • ${r.id} — ${r.title}`);

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
