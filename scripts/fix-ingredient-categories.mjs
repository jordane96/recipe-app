/**
 * One-off data pass: move miscategorised ingredients out of Produce.
 *
 * `category` drives which aisle group an item lands in on the shopping list, so a wrong value
 * doesn't just look odd — it sends you to the wrong part of the shop. Two items are filed under
 * produce while every comparable item sits in pantry:
 *
 *   - `chicken-stock` — beef stock, chicken broth, vegetable broth and both stock concentrates
 *     are all pantry. This one is the odd one out, so you're sent to Produce for a carton.
 *   - `green-chiles` ("Green chiles (canned)") — `canned-tomatoes` is already pantry. A canned
 *     good belongs with the tins, not the fresh veg, however vegetable its contents.
 *
 * Deliberately NOT touched here: `custom-m-ms` ("M&Ms", also filed as produce). It's used by
 * exactly one recipe — `test-recipe` / "Test recipe2" — which is scratch data that happens to be
 * public. Recategorising it would tidy the symptom; the recipe itself is the thing to deal with.
 *
 * Usage:
 *   node scripts/fix-ingredient-categories.mjs                  # dry run — prints the plan
 *   node scripts/fix-ingredient-categories.mjs --apply          # writes to .env.local (dev)
 *   node scripts/fix-ingredient-categories.mjs --prod --apply   # writes to production
 *
 * Idempotent: an ingredient already in the target category is reported and skipped.
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

const MOVES = [
  { id: "chicken-stock", to: "pantry", because: "beef stock / chicken broth / vegetable broth are all pantry" },
  { id: "green-chiles", to: "pantry", because: "canned-tomatoes is pantry; canned goods aren't the produce aisle" },
];

async function main() {
  console.log(`Target: ${PROD ? "PRODUCTION" : "development (.env.local)"}`);
  console.log(APPLY ? "Mode:   APPLY\n" : "Mode:   dry run (no writes)\n");

  for (const move of MOVES) {
    const [row] = await sql`SELECT id, name, category FROM ingredients WHERE id = ${move.id}`;
    if (!row) {
      console.log(`- ${move.id}: not found, skipped.`);
      continue;
    }
    if (row.category === move.to) {
      console.log(`- ${move.id}: already ${move.to}.`);
      continue;
    }
    console.log(`- ${move.id} ("${row.name}"): ${row.category} → ${move.to}`);
    console.log(`    ${move.because}`);
    if (APPLY) {
      await sql`UPDATE ingredients SET category = ${move.to} WHERE id = ${move.id}`;
    }
  }

  // Anything else still sitting in produce that plainly isn't fresh food is worth eyeballing.
  const suspicious = await sql`
    SELECT id, name FROM ingredients
    WHERE category = 'produce'
      AND (name ILIKE '%canned%' OR name ILIKE '%stock%' OR name ILIKE '%broth%' OR name ILIKE '%sauce%')
    ORDER BY name
  `;
  if (suspicious.length > 0) {
    console.log("\nStill in produce and worth a look:");
    for (const s of suspicious) console.log(`   • ${s.id} — ${s.name}`);
  }

  if (!APPLY) console.log("\nDry run only. Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
