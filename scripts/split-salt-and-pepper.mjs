/**
 * One-off data pass: replace the combined `salt-and-pepper` ingredient with `salt` + `black-pepper`.
 *
 * "Salt and pepper" is one catalog row standing for two groceries, used on 12 recipes. It causes
 * concrete problems:
 *
 *   - **Shopping / ordering.** The Kroger matcher searches the literal phrase "salt and pepper",
 *     which at a real store returns *Simple Truth Salt and Pepper Pistachio Kernels*. Both halves
 *     are staples that should never reach the order at all; as separate ingredients they're
 *     correctly filtered out, and the bogus row disappears.
 *   - **Scaling and merging.** A line can't mean two things, so `shoppingMerge` can't combine the
 *     salt in this recipe with the salt in another.
 *
 * `salt` and `black-pepper` both already exist in the catalog, both already flagged `staple`, so
 * this is purely a re-pointing of existing lines — no new ingredients.
 *
 * **Amounts.** 9 of the 12 lines are amount-less (`to taste`) and split with no judgement needed.
 * The 3 that carry a quantity are halved (1 tsp → ½ tsp each). That's a genuine assumption: the
 * original never recorded the ratio. It's low-stakes because both are staples — the number is
 * display-only and never reaches a shopping list — but it *is* an assumption, not data.
 *
 * **Notes.** A note of the form "X and Y" is split across the two lines ("sea salt and freshly
 * ground black pepper" → "sea salt" / "freshly ground black pepper"). Anything else stays whole
 * on the salt line rather than being duplicated onto both.
 *
 * Usage:
 *   node scripts/split-salt-and-pepper.mjs                  # dry run — prints every line it would change
 *   node scripts/split-salt-and-pepper.mjs --apply          # writes to .env.local (dev branch)
 *   node scripts/split-salt-and-pepper.mjs --prod --apply   # writes to production
 *
 * Idempotent: once no lines reference `salt-and-pepper`, re-running reports nothing to do.
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

const COMBINED = "salt-and-pepper";
const SALT = "salt";
const PEPPER = "black-pepper";

/** "sea salt and freshly ground black pepper" → ["sea salt", "freshly ground black pepper"]. */
function splitNote(note) {
  if (!note) return [null, null];
  const parts = note.split(/\s+and\s+/i);
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return [note, null];
}

/** Halve a quantity; amount-less lines stay amount-less. */
function halve(amount) {
  return amount == null ? null : amount / 2;
}

async function main() {
  console.log(`Target: ${PROD ? "PRODUCTION" : "development (.env.local)"}`);
  console.log(APPLY ? "Mode:   APPLY\n" : "Mode:   dry run (no writes)\n");

  for (const id of [SALT, PEPPER]) {
    const [row] = await sql`SELECT id FROM ingredients WHERE id = ${id}`;
    if (!row) throw new Error(`Ingredient "${id}" is missing — cannot split into it.`);
  }

  const affected = await sql`
    SELECT DISTINCT s.id AS section_id, s.recipe_id, s.name AS section_name, r.title
    FROM ingredient_sections s
    JOIN ingredient_lines l ON l.section_id = s.id
    JOIN recipes r ON r.id = s.recipe_id
    WHERE l.ingredient_id = ${COMBINED}
    ORDER BY r.title
  `;

  if (affected.length === 0) {
    console.log(`No lines reference "${COMBINED}". Nothing to do.`);
    return;
  }

  let changed = 0;
  for (const sec of affected) {
    const lines = await sql`
      SELECT id, ingredient_id, amount, unit, note, sort_order
      FROM ingredient_lines WHERE section_id = ${sec.section_id}
      ORDER BY sort_order
    `;

    const rebuilt = [];
    for (const l of lines) {
      if (l.ingredient_id !== COMBINED) {
        rebuilt.push(l);
        continue;
      }
      const [saltNote, pepperNote] = splitNote(l.note);
      const amt = halve(l.amount == null ? null : Number(l.amount));
      rebuilt.push({ ingredient_id: SALT, amount: amt, unit: l.unit, note: saltNote });
      rebuilt.push({ ingredient_id: PEPPER, amount: amt, unit: l.unit, note: pepperNote });
      changed++;
      const shown = l.amount == null ? `— ${l.unit}` : `${l.amount} ${l.unit}`;
      const half = amt == null ? `— ${l.unit}` : `${amt} ${l.unit}`;
      console.log(`- ${sec.recipe_id} [${sec.section_name}]`);
      console.log(`    ${COMBINED} ${shown}${l.note ? ` // ${l.note}` : ""}`);
      console.log(`      → ${SALT} ${half}${saltNote ? ` // ${saltNote}` : ""}`);
      console.log(`      → ${PEPPER} ${half}${pepperNote ? ` // ${pepperNote}` : ""}`);
    }

    if (!APPLY) continue;

    // Rewrite the whole section so sort_order stays contiguous after the extra line lands.
    await sql`DELETE FROM ingredient_lines WHERE section_id = ${sec.section_id}`;
    for (let i = 0; i < rebuilt.length; i++) {
      const l = rebuilt[i];
      await sql`
        INSERT INTO ingredient_lines (section_id, ingredient_id, amount, unit, note, sort_order)
        VALUES (${sec.section_id}, ${l.ingredient_id}, ${l.amount ?? null}, ${l.unit ?? null}, ${l.note ?? null}, ${i})
      `;
    }
  }

  console.log(`\n${changed} line(s) across ${affected.length} section(s).`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  // Retire the combined ingredient once nothing points at it.
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM ingredient_lines WHERE ingredient_id = ${COMBINED}
  `;
  if (count === 0) {
    await sql`DELETE FROM ingredients WHERE id = ${COMBINED}`;
    console.log(`Removed the now-unused "${COMBINED}" ingredient.`);
  } else {
    console.log(`"${COMBINED}" still referenced by ${count} line(s) — left in place.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
