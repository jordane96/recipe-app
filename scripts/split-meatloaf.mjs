/**
 * One-off data pass: split "Soy glazed meatloaf" into its two actual recipes.
 *
 * The record holds two dishes. Steps 1–9 are the Kinder's-glaze version; steps 10–13 are a
 * different meal that opens "Alternate mushroom sauce: Roast meatloaf (no glaze or sauce)".
 *
 * The damaging part is the ingredients. There is a section literally named
 * `Alternate sauce (mushroom sauce)` **containing zero lines**, so the mushroom version's
 * ingredients existed only as prose inside step text — cook it and the shopping list silently
 * omits every single thing you need for the sauce. The glaze version has the mirror problem: it
 * carries `kinders-glaze` you won't use if you take the mushroom route.
 *
 * Result:
 *   - `soy-glazed-meatloaf`      — unchanged dish, minus the mushroom steps and the empty section.
 *   - `meatloaf-mushroom-sauce`  — new, with the sauce ingredients finally recorded as real lines.
 *
 * Sauce amounts supplied by Jordan (they were never in the data):
 *   Button mushrooms 4 oz · Beef stock concentrate 1 pouch · Water ¼ cup · Sour cream 1½ tbsp
 *
 * Butter 1 tbsp is carried over from the original step 13 ("add 1.5 tbsp sour cream and 1 tbsp
 * butter"). It wasn't in the supplied list — flagged rather than dropped, since removing an
 * ingredient the recipe text calls for is the more damaging guess.
 *
 * Water is included as a line even though it's never shopped: it's flagged `staple`, so it shows
 * in the recipe and cook mode but is filtered out of the shopping list and orders automatically.
 *
 * Like the air-fryer chicken split, the two are **not** joined by `forked_from_recipe_id` — that
 * column means "my personal replacement for the original" and App.tsx hides the original from
 * anyone who owns a fork of it. See docs/recipe-variants.md.
 *
 * Usage:
 *   node scripts/split-meatloaf.mjs                  # dry run
 *   node scripts/split-meatloaf.mjs --apply          # writes to .env.local (dev branch)
 *   node scripts/split-meatloaf.mjs --prod --apply   # writes to production
 *
 * Idempotent: re-running after a successful apply reports the split is already done.
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

const GLAZE_ID = "soy-glazed-meatloaf";
const MUSHROOM_ID = "meatloaf-mushroom-sauce";

/** The loaf itself — identical in both recipes. */
const LOAF_LINES = [
  { ingredientId: "ground-beef-90", amount: 16, unit: "oz", note: "85–90% lean" },
  { ingredientId: "egg", amount: 2, unit: "each", note: null },
  { ingredientId: "breadcrumbs", amount: 0.5, unit: "cup", note: null },
  { ingredientId: "garlic", amount: 3, unit: "clove", note: "paste" },
  { ingredientId: "mccormick-meatloaf-seasoning", amount: 0.33, unit: "pack", note: null },
];

const GLAZE_SECTIONS = [
  { name: "Main", lines: LOAF_LINES },
  {
    name: "Sauce",
    lines: [
      { ingredientId: "kinders-glaze", amount: 0.5, unit: "cup", note: "¼ cup before + ¼ cup after" },
    ],
  },
];

const MUSHROOM_SECTIONS = [
  { name: "Main", lines: LOAF_LINES },
  {
    name: "Mushroom sauce",
    lines: [
      { ingredientId: "mushroom-button", amount: 4, unit: "oz", note: "trimmed and thinly sliced" },
      { ingredientId: "beef-stock-concentrate", amount: 1, unit: "pouch", note: null },
      { ingredientId: "water", amount: 0.25, unit: "cup", note: null },
      { ingredientId: "sour-cream", amount: 1.5, unit: "tbsp", note: null },
      { ingredientId: "butter", amount: 1, unit: "tbsp", note: null },
    ],
  },
];

/** Steps 1–9 of the original, with the mushroom branch removed. */
const GLAZE_STEPS = [
  { text: "Mix glaze", durationSeconds: null },
  { text: "Zest garlic", durationSeconds: null },
  { text: "Prep potatoes per **Sliced potatoes** side (slice or dice, toss with olive oil, salt, and pepper)", durationSeconds: null },
  { text: "Mix meatloaf together, shape into loaf (7 inches x 3 inches), add salt and pepper", durationSeconds: null },
  { text: "Put loaf on pan, top with half the glaze", durationSeconds: null },
  { text: "Add potatoes to the pan with the loaf", durationSeconds: null },
  { text: "Cook for 25 min at 450", durationSeconds: 1500 },
  { text: "Let sit for 2 minutes", durationSeconds: 120 },
  { text: "Add other half of glaze", durationSeconds: null },
];

/**
 * The loaf steps with no glaze, then the sauce. "Cook 203 min" in the source note is read as the
 * 2–3 minute simmer the original step 12 already stated.
 */
const MUSHROOM_STEPS = [
  { text: "Zest garlic", durationSeconds: null },
  { text: "Prep potatoes per **Sliced potatoes** side (slice or dice, toss with olive oil, salt, and pepper)", durationSeconds: null },
  { text: "Mix meatloaf together, shape into loaf (7 inches x 3 inches), add salt and pepper", durationSeconds: null },
  { text: "Put loaf on pan — no glaze or sauce", durationSeconds: null },
  { text: "Add potatoes to the pan with the loaf", durationSeconds: null },
  { text: "Roast for 25 min at 450", durationSeconds: 1500 },
  { text: "Let sit for 2 minutes", durationSeconds: 120 },
  { text: "Trim and thinly slice mushrooms; saute with salt and pepper 2-4 minutes (until soft)", durationSeconds: 240 },
  { text: "Add stock concentrate and ¼ cup water; boil, then reduce to low simmer for 2-3 minutes", durationSeconds: 180 },
  { text: "Turn off heat, add sour cream and butter; spoon over the meatloaf once ready", durationSeconds: null },
];

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

async function writeSteps(recipeId, steps) {
  await sql`DELETE FROM recipe_instructions WHERE recipe_id = ${recipeId}`;
  for (let i = 0; i < steps.length; i++) {
    await sql`
      INSERT INTO recipe_instructions (recipe_id, sort_order, text, duration_seconds, note, step_ingredients)
      VALUES (${recipeId}, ${i}, ${steps[i].text}, ${steps[i].durationSeconds}, null, null)
    `;
  }
}

function describe(label, secs, steps) {
  return (
    `${label}\n` +
    secs
      .map((s) => `      [${s.name}] ` + s.lines.map((l) => `${l.ingredientId} ${l.amount ?? "—"} ${l.unit}`).join(", "))
      .join("\n") +
    `\n      ${steps.length} steps`
  );
}

async function main() {
  console.log(`Target: ${PROD ? "PRODUCTION" : "development (.env.local)"}`);
  console.log(APPLY ? "Mode:   APPLY\n" : "Mode:   dry run (no writes)\n");

  const [base] = await sql`SELECT id, "Owner", visibility, servings, source_url FROM recipes WHERE id = ${GLAZE_ID}`;
  if (!base) {
    console.log(`- ${GLAZE_ID}: not found. Nothing to split.`);
    return;
  }
  const [already] = await sql`SELECT id FROM recipes WHERE id = ${MUSHROOM_ID}`;
  if (already) {
    console.log(`- ${MUSHROOM_ID}: already exists — split has been run. Nothing to do.`);
    return;
  }

  console.log(describe(`- rewrite ${GLAZE_ID} → "Soy glazed meatloaf"`, GLAZE_SECTIONS, GLAZE_STEPS));
  console.log(`      drops the empty "Alternate sauce (mushroom sauce)" section and steps 10–13`);
  console.log(describe(`- create  ${MUSHROOM_ID} → "Meatloaf with mushroom sauce"`, MUSHROOM_SECTIONS, MUSHROOM_STEPS));
  console.log(`      copies the "Sliced potatoes" recommended side`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  await sql`
    INSERT INTO recipes (id, title, description, type, tags, servings, source_url, notes, "Owner", visibility)
    VALUES (
      ${MUSHROOM_ID},
      'Meatloaf with mushroom sauce',
      'Roasted meatloaf with a pan mushroom sauce — no glaze',
      'recipe',
      ${["main", "beef", "baked"]},
      ${base.servings ?? 2},
      ${base.source_url ?? null},
      null,
      ${base.Owner},
      ${base.visibility ?? "public"}
    )
  `;
  await writeSections(MUSHROOM_ID, MUSHROOM_SECTIONS);
  await writeSteps(MUSHROOM_ID, MUSHROOM_STEPS);

  // The potato side applies to both versions — same pan, same timing.
  const sides = await sql`SELECT side_recipe_id, label FROM recipe_recommended_sides WHERE recipe_id = ${GLAZE_ID}`;
  for (const s of sides) {
    await sql`
      INSERT INTO recipe_recommended_sides (recipe_id, side_recipe_id, label)
      VALUES (${MUSHROOM_ID}, ${s.side_recipe_id}, ${s.label})
    `;
  }

  await writeSections(GLAZE_ID, GLAZE_SECTIONS);
  await writeSteps(GLAZE_ID, GLAZE_STEPS);

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
