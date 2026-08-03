/**
 * Exports the whole ingredient catalog with its current staple flag, for review in a spreadsheet.
 *
 * Every ingredient is included, not just the staples, so the sheet can be edited in *both*
 * directions — flip `staple` to TRUE to hide something from the shopping list, FALSE to put it
 * back. Rows are ordered staples-first so the current set reads as one block at the top.
 *
 * The `staple` column and the `rule` explaining it both come from `api/_staples.js` — the same
 * module the API serves from — so this can't drift from what the app actually does.
 *
 * Usage: node scripts/export-staples-csv.mjs [outputPath]
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import {
  CATEGORY_EXCEPTIONS,
  STAPLE_CATEGORIES,
  STAPLE_IDS,
  isStaple,
} from "../api/_staples.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing — run `vercel env pull .env.local` first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const outPath = process.argv[2] ?? resolve(root, "staples-review.csv");

const stapleIdSet = new Set(STAPLE_IDS);

/** Human-readable reason this row is / isn't a staple. */
function ruleFor(row) {
  if (CATEGORY_EXCEPTIONS.has(row.id)) {
    return `excluded from ${row.category} by hand`;
  }
  if (STAPLE_CATEGORIES.includes(row.category)) {
    return `whole "${row.category}" category`;
  }
  if (stapleIdSet.has(row.id)) {
    return "picked by hand";
  }
  return "";
}

/** RFC-4180: quote every field, double any embedded quote. Names contain commas and parens. */
function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

const run = async () => {
  const catalog = await sql`SELECT id, name, category FROM ingredients ORDER BY category, name`;
  // The flag isn't stored — derive it the same way the API does.
  const rows = catalog.map((r) => ({ ...r, staple: isStaple(r) }));

  // Staples first (that's what's under review), each block alphabetical by category then name.
  const sorted = [...rows].sort((a, b) => {
    if (a.staple !== b.staple) return a.staple ? -1 : 1;
    return (
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    );
  });

  const lines = [["id", "name", "category", "staple", "rule"].map(csvCell).join(",")];
  for (const r of sorted) {
    lines.push(
      [r.id, r.name, r.category, r.staple ? "TRUE" : "FALSE", ruleFor(r)]
        .map(csvCell)
        .join(","),
    );
  }

  // BOM so Excel/Sheets read the accented names (Crème fraîche, Gruyère) as UTF-8.
  writeFileSync(outPath, "﻿" + lines.join("\r\n") + "\r\n", "utf8");

  const n = rows.filter((r) => r.staple).length;
  console.log(`${rows.length} ingredients (${n} staples) → ${outPath}`);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
