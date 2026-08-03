/**
 * One-off data pass: split "Chicken (air fried)" into its two actual recipes.
 *
 * The recipe carries a single section named `Optional spice mix` holding **both** rubs:
 *
 *     italian-seasoning 1 tbsp ┐
 *     garlic-powder     1 tsp  ├ the Italian rub
 *     paprika           ½ tsp  │
 *     salt-and-pepper   1 tsp  ┘
 *     cajun-rub         1 tbsp   ← the entire Cajun alternative
 *
 * Nothing in the app reads the word "Optional", so planning this meal puts *both* rubs on the
 * shopping list and reads both out in cook mode. Two dishes in one record.
 *
 * Per docs/recipe-variants.md the fix is two standalone recipes, rather than a `variants[]` array
 * that every consumer (shoppingMerge, cook mode, planner, Kroger matcher, servings scaling, tag
 * filter) would have to learn about.
 *
 * **They are deliberately NOT joined by `forked_from_recipe_id`.** That column already has a
 * meaning — App.tsx hides a recipe from anyone who owns a fork of it, because a fork is your
 * personal replacement for the original. Setting it here made the Cajun recipe vanish from the
 * owner's library. Sibling variants need a link that means "see also", which doesn't exist yet;
 * until it does, the two stand alone and are found by name and tags.
 *
 * Cajun keeps the original id: the existing description already reads "Cajun-style rub", so
 * anything pointing at `chicken-air-fried` stays pointing at the recipe it meant.
 *
 * Also folded in, since the rows are being rewritten anyway:
 *   - Olive oil is added as a real ingredient line. Steps say "Coat in olive oil" and the chicken
 *     note says "with olive oil & cajun rub", but no olive oil line existed. Amount-less via the
 *     `to taste` sentinel — the source never gave a quantity and inventing one would be worse.
 *   - Two leftover test notes ("This is a sample note v2", "This is another test note") are
 *     cleared out of what is a public recipe.
 *
 * `salt-and-pepper` is deliberately left alone. It's a combined ingredient used across 12
 * recipes and wants splitting into salt + black-pepper everywhere at once, not here.
 *
 * Usage:
 *   node scripts/split-air-fryer-chicken.mjs                  # dry run — prints the plan
 *   node scripts/split-air-fryer-chicken.mjs --apply          # writes to .env.local (dev branch)
 *   node scripts/split-air-fryer-chicken.mjs --prod --apply   # writes to production
 *
 * Idempotent: re-running after a successful apply reports that the split is already done.
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

const CAJUN_ID = "chicken-air-fried";
const ITALIAN_ID = "chicken-air-fried-italian";

/** Shared by both variants — same cut, same method, same timings. */
const MAIN_LINE = {
  ingredientId: "chicken-breast",
  amount: 8,
  unit: "oz",
  note: "butterflied if thick",
};

/** `to taste` is the app's amount-less sentinel (see the Ingredient units note in CLAUDE.md). */
const OLIVE_OIL_LINE = { ingredientId: "olive-oil", amount: null, unit: "to taste", note: "for coating" };

const STEPS = [
  { text: "Butterfly chicken and pound (optional)", durationSeconds: null, note: null, stepIngredients: ["Chicken breast"] },
  { text: "Coat in olive oil and rub/spices", durationSeconds: null, note: null, stepIngredients: ["Olive oil", "Rub"] },
  { text: "Air Fry 10-13 minutes at 350", durationSeconds: 600, note: null, stepIngredients: ["Coated chicken"] },
];

const CAJUN_RUB = [{ ingredientId: "cajun-rub", amount: 1, unit: "tbsp", note: null }];

const ITALIAN_RUB = [
  { ingredientId: "italian-seasoning", amount: 1, unit: "tbsp", note: null },
  { ingredientId: "garlic-powder", amount: 1, unit: "tsp", note: null },
  { ingredientId: "paprika", amount: 0.5, unit: "tsp", note: null },
  { ingredientId: "salt-and-pepper", amount: 1, unit: "tsp", note: null },
];

const sections = (rub) => [
  { name: "Main", lines: [MAIN_LINE, OLIVE_OIL_LINE] },
  { name: "Rub", lines: rub },
];

/** Replace a recipe's sections + lines wholesale (delete then insert, preserving order). */
async function writeSections(recipeId, secs) {
  const existing = await sql`SELECT id FROM ingredient_sections WHERE recipe_id = ${recipeId}`;
  for (const s of existing) {
    await sql`DELETE FROM ingredient_lines WHERE section_id = ${s.id}`;
  }
  await sql`DELETE FROM ingredient_sections WHERE recipe_id = ${recipeId}`;
  for (let si = 0; si < secs.length; si++) {
    const [newSec] = await sql`
      INSERT INTO ingredient_sections (recipe_id, name, sort_order)
      VALUES (${recipeId}, ${secs[si].name}, ${si})
      RETURNING id
    `;
    for (let li = 0; li < secs[si].lines.length; li++) {
      const l = secs[si].lines[li];
      await sql`
        INSERT INTO ingredient_lines (section_id, ingredient_id, amount, unit, note, sort_order)
        VALUES (${newSec.id}, ${l.ingredientId}, ${l.amount}, ${l.unit}, ${l.note}, ${li})
      `;
    }
  }
}

async function writeSteps(recipeId) {
  await sql`DELETE FROM recipe_instructions WHERE recipe_id = ${recipeId}`;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i];
    await sql`
      INSERT INTO recipe_instructions (recipe_id, sort_order, text, duration_seconds, note, step_ingredients)
      VALUES (${recipeId}, ${i}, ${s.text}, ${s.durationSeconds}, ${s.note}, ${s.stepIngredients})
    `;
  }
}

function describe(label, secs) {
  const lines = secs
    .map((s) => `      ${s.name}: ` + s.lines.map((l) => `${l.ingredientId} ${l.amount ?? "—"} ${l.unit}`).join(", "))
    .join("\n");
  return `${label}\n${lines}`;
}

async function main() {
  console.log(`Target: ${PROD ? "PRODUCTION" : "development (.env.local)"}`);
  console.log(APPLY ? "Mode:   APPLY\n" : "Mode:   dry run (no writes)\n");

  const [base] = await sql`SELECT id, title, "Owner", visibility, source_url, servings FROM recipes WHERE id = ${CAJUN_ID}`;
  if (!base) {
    console.log(`- ${CAJUN_ID}: not found. Nothing to split.`);
    return;
  }
  const [already] = await sql`SELECT id FROM recipes WHERE id = ${ITALIAN_ID}`;
  if (already) {
    console.log(`- ${ITALIAN_ID}: already exists — split has been run. Nothing to do.`);
    return;
  }

  console.log(describe(`- rewrite ${CAJUN_ID} → "Air fryer chicken (Cajun)"`, sections(CAJUN_RUB)));
  console.log(describe(`- create  ${ITALIAN_ID} → "Air fryer chicken (Italian)"`, sections(ITALIAN_RUB)));
  console.log(`- clear   2 leftover test notes on the shared steps`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  await sql`
    INSERT INTO recipes (id, title, description, type, tags, servings, source_url, notes, "Owner", visibility)
    VALUES (
      ${ITALIAN_ID},
      'Air fryer chicken (Italian)',
      'Juicy chicken breast in the air fryer with an Italian seasoning rub — quick weeknight protein',
      'recipe',
      ${["main", "chicken", "air-fryer", "italian"]},
      ${base.servings ?? 1},
      ${base.source_url ?? null},
      null,
      ${base.Owner},
      ${base.visibility ?? "public"}
    )
  `;
  await writeSections(ITALIAN_ID, sections(ITALIAN_RUB));
  await writeSteps(ITALIAN_ID);

  await sql`
    UPDATE recipes
    SET title = 'Air fryer chicken (Cajun)',
        description = 'Juicy chicken breast in the air fryer with a Cajun-style rub — quick weeknight protein'
    WHERE id = ${CAJUN_ID}
  `;
  await writeSections(CAJUN_ID, sections(CAJUN_RUB));
  await writeSteps(CAJUN_ID);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
