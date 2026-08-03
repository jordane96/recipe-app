/**
 * One-off data pass: rewrite ingredient lines that faked a quantity because the editor used to
 * force a unit from the ingredient's catalog kind.
 *
 * Before flexible units (see the "Ingredient units" note in CLAUDE.md) a line could only use its
 * ingredient's own family, so "to taste" and "a pinch" got smuggled into the note with an
 * invented `1 tsp` in front. Those amounts are wrong, not merely untidy — a tsp is roughly six
 * pinches, and the shopping list was summing them.
 *
 * Only touches recipes owned by OWNER. Other users' recipes are reported and skipped.
 *
 * Usage:
 *   node scripts/fix-ingredient-units.mjs           # dry run — prints the plan, writes nothing
 *   node scripts/fix-ingredient-units.mjs --apply   # writes, after dumping a backup
 *
 * `.env.local`'s DATABASE_URL is currently repointed at a disposable Neon branch, so that is what
 * this hits by default. Add `--prod` to target the production value preserved on the commented
 * line above it:
 *
 *   node scripts/fix-ingredient-units.mjs --prod            # dry run against production
 *   node scripts/fix-ingredient-units.mjs --prod --apply
 *
 * The backup file is overwritten each run — copy it aside if you need more than the last one.
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
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

/**
 * `.env.local`'s live DATABASE_URL is currently repointed at a disposable Neon branch, with the
 * real production value preserved as a commented line above it. `--prod` reads that line, so the
 * connection string stays in the file instead of being passed around on a command line.
 */
function productionUrl() {
  const line = readFileSync(envFile, "utf-8")
    .split(/\r?\n/)
    .find((l) => /^#\s*DATABASE_URL=/.test(l));
  const m = line && line.match(/DATABASE_URL="([^"]+)"/);
  if (!m) {
    console.error("No commented production DATABASE_URL found in .env.local.");
    process.exit(1);
  }
  return m[1];
}

const connectionString = PROD ? productionUrl() : process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL missing — run `vercel env pull .env.local` first.");
  process.exit(1);
}

// Say out loud which database is about to be touched — the two are easy to confuse.
console.log(
  `target: ${(connectionString.match(/@([^/]+)/) || [])[1]}${PROD ? "  (production)" : ""}\n`,
);

const sql = neon(connectionString);
const OWNER = "JordanE";

/**
 * Each edit is matched on (recipe title, ingredient id, exact existing note) so it can only ever
 * hit the row it was written for — re-running after a change is a no-op rather than a surprise.
 */
const EDITS = [
  // — Qualitative amounts that were wearing a fake quantity —
  { recipe: "Chicken Parmesan", ing: "salt-and-pepper", note: "to taste",
    set: { amount: null, unit: "to taste", note: null } },
  { recipe: "Turkey Chili - crock pot", ing: "salt", note: "to taste",
    set: { amount: null, unit: "to taste", note: null } },
  // Two copies of this recipe exist (an original and a fork); both approved.
  { recipe: "Šaltibarščiai", ing: "salt", note: "to taste", anyOwner: true,
    set: { amount: null, unit: "to taste", note: null } },
  { recipe: "Šaltibarščiai", ing: "dill", note: "chopped, to taste", anyOwner: true,
    set: { amount: null, unit: "to taste", note: "chopped" } },

  // — "a pinch" written as 1 tsp: ~6x too much —
  { recipe: "Turkey Chili - crock pot", ing: "black-pepper", note: "pinch, ground",
    set: { amount: 1, unit: "pinch", note: "ground" } },
  { recipe: "Turkey Chili - crock pot", ing: "allspice", note: "pinch, ground",
    set: { amount: 1, unit: "pinch", note: "ground" } },
  { recipe: "Šaltibarščiai", ing: "dill", note: "fresh, a pinch", anyOwner: true,
    set: { amount: 1, unit: "pinch", note: "fresh" } },
  { recipe: "Hummus", ing: "paprika", note: "dash — or sumac/za’atar, for serving",
    set: { amount: 1, unit: "pinch", note: "or sumac/za’atar, for serving" } },

  // — Herbs counted as "each" —
  // The note already stated the real measure, so take it at its word.
  { recipe: "Chicken Marsala", ing: "parsley",
    note: "chopped fresh Italian, for serving (optional). 2tbsp",
    set: { amount: 2, unit: "tbsp", note: "chopped fresh Italian, for serving (optional)" } },
  // "0.333 each" parsley is meaningless; a third of a bunch merges sensibly across recipes.
  { recipe: "Chicken Piccata", ing: "parsley", note: "fresh, chopped",
    set: { amount: 0.333, unit: "bunch", note: "fresh, chopped" } },
  { recipe: "Green Chicken Pozole (Pozole Verde)", ing: "cilantro", note: "chopped",
    set: { amount: 1, unit: "bunch", note: "chopped" } },

  // — Salt that rendered "to taste" only because the note said so, with no unit at all.
  //   Looked right, but nothing downstream could tell it was qualitative.
  { recipe: "Butter Chicken", ing: "salt", note: "to taste",
    set: { amount: null, unit: "to taste", note: null } },
  { recipe: "Hummus", ing: "salt", note: "to taste",
    set: { amount: null, unit: "to taste", note: null } },

  // — Bacon by the strip rather than by weight. The only Quiche Lorraine in the library belongs
  //   to another user; edit approved explicitly, hence anyOwner.
  { recipe: "Quiche Lorraine", ing: "bacon", note: null, anyOwner: true,
    set: { amount: 4, unit: "strip", note: null } },

  // — Canned goods: keep ounces, so flip the rows that stored a can count with the size in the
  //   note. Multi-can rows fold the count into the total weight.
  { recipe: "Chicken and Dumplings", ing: "cream-of-chicken-soup", note: "10.5 oz cans, condensed",
    set: { amount: 21, unit: "oz", note: "condensed; 2 × 10.5 oz cans" } },
  { recipe: "Tortellini, Spinach & Chicken Soup", ing: "canned-tomatoes",
    note: "petite diced, 14.5 oz cans",
    set: { amount: 29, unit: "oz", note: "petite diced; 2 × 14.5 oz cans" } },
  { recipe: "Turkey Chili - crock pot", ing: "tomato-soup", note: "10.75 oz cans, low sodium",
    set: { amount: 10.75, unit: "oz", note: "low sodium" } },
  { recipe: "Turkey Chili - crock pot", ing: "kidney-beans", note: "15 oz cans, drained",
    set: { amount: 15, unit: "oz", note: "drained" } },
  { recipe: "Turkey Chili - crock pot", ing: "black-beans", note: "15 oz can, drained",
    set: { amount: 15, unit: "oz", note: "drained" } },
  { recipe: "Hummus", ing: "chickpeas", note: "15 oz can, drained (or 1½ cups cooked)",
    set: { amount: 15, unit: "oz", note: "drained (or 1½ cups cooked)" } },
];

const fmt = (r) =>
  `${r.amount ?? "—"} ${r.unit ?? "—"}${r.note ? `  (${r.note})` : ""}`;

const run = async () => {
  const rows = await sql`
    SELECT l.id, l.amount, l.unit, l.note, l.ingredient_id,
           r.title, r."Owner" AS owner, i.name AS ing_name
    FROM ingredient_lines l
    JOIN ingredient_sections s ON s.id = l.section_id
    JOIN recipes r ON r.id = s.recipe_id
    LEFT JOIN ingredients i ON i.id = l.ingredient_id
  `;

  const planned = [];
  const skippedOtherOwner = [];
  const unmatched = [];

  for (const e of EDITS) {
    const hits = rows.filter(
      (r) =>
        r.title === e.recipe &&
        r.ingredient_id === e.ing &&
        (r.note ?? "") === (e.note ?? ""),
    );
    if (hits.length === 0) {
      unmatched.push(e);
      continue;
    }
    for (const h of hits) {
      // Another user's recipe is off-limits unless that specific edit was signed off.
      if (h.owner !== OWNER && !e.anyOwner) {
        skippedOtherOwner.push({ h, e });
        continue;
      }
      planned.push({ h, e });
    }
  }

  console.log(`${APPLY ? "APPLYING" : "DRY RUN"} — ${planned.length} line(s) to update\n`);
  for (const { h, e } of planned) {
    console.log(`  ${h.title} :: ${h.ing_name}`);
    console.log(`      ${fmt(h)}`);
    console.log(`   →  ${fmt({ ...e.set })}\n`);
  }

  if (skippedOtherOwner.length) {
    console.log(`skipped — owned by someone else (${skippedOtherOwner.length}):`);
    for (const { h } of skippedOtherOwner) {
      console.log(`  [${h.owner}] ${h.title} :: ${h.ing_name} — ${fmt(h)}`);
    }
    console.log("");
  }
  if (unmatched.length) {
    console.log(`no matching row (already fixed, or the note changed):`);
    for (const e of unmatched) console.log(`  ${e.recipe} :: ${e.ing}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("Nothing written. Re-run with --apply to commit.");
    return;
  }

  const backupPath = resolve(root, "scripts/fix-ingredient-units.backup.json");
  writeFileSync(
    backupPath,
    JSON.stringify(planned.map(({ h }) => h), null, 2),
    "utf8",
  );
  console.log(`backup of the ${planned.length} original row(s) → ${backupPath}`);

  for (const { h, e } of planned) {
    await sql`
      UPDATE ingredient_lines
      SET amount = ${e.set.amount}, unit = ${e.set.unit}, note = ${e.set.note}
      WHERE id = ${h.id}
    `;
  }
  console.log(`done — ${planned.length} line(s) updated.`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
