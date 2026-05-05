#!/usr/bin/env node
/**
 * One-shot DB migration:
 *   1. Copy `recipes.course` values into `recipes.tags` ("main" / "side").
 *   2. Backfill "main" onto every recipe that has neither "main" nor "side"
 *      (mains were previously stored as `course = NULL`, the implicit default).
 *   3. Drop the `course` column.
 *
 * Idempotent: each step is a no-op once already applied.
 *
 * Usage:
 *   node scripts/migrate-course-to-tags.mjs            # uses DATABASE_URL from .env.local
 *   DATABASE_URL=... node scripts/migrate-course-to-tags.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, "..", ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (looked at env and .env.local)");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const [{ exists }] = await sql`
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recipes' AND column_name = 'course'
  ) AS exists
`;

if (exists) {
  const before = await sql`
    SELECT id, course, tags FROM recipes WHERE course IS NOT NULL
  `;
  console.log(`Step 1: ${before.length} recipe(s) with course set:`);
  for (const r of before) {
    console.log(`  ${r.id}  course=${r.course}  tags=${JSON.stringify(r.tags ?? [])}`);
  }

  const copied = await sql`
    UPDATE recipes
    SET tags = COALESCE(tags, '{}'::text[]) || ARRAY[course]
    WHERE course IS NOT NULL
      AND NOT (COALESCE(tags, '{}'::text[]) @> ARRAY[course])
    RETURNING id
  `;
  console.log(`  Copied course → tags on ${copied.length} row(s).`);

  await sql`ALTER TABLE recipes DROP COLUMN course`;
  console.log("  Dropped recipes.course column.");
} else {
  console.log("Step 1 skipped: course column already dropped.");
}

const backfilled = await sql`
  UPDATE recipes
  SET tags = COALESCE(tags, '{}'::text[]) || ARRAY['main']
  WHERE NOT (COALESCE(tags, '{}'::text[]) @> ARRAY['main'])
    AND NOT (COALESCE(tags, '{}'::text[]) @> ARRAY['side'])
  RETURNING id
`;
console.log(`\nStep 2: backfilled "main" tag on ${backfilled.length} recipe(s).`);

const stats = await sql`
  SELECT
    (SELECT count(*) FROM recipes WHERE 'main' = ANY(tags))::int AS mains,
    (SELECT count(*) FROM recipes WHERE 'side' = ANY(tags))::int AS sides,
    (SELECT count(*) FROM recipes)::int AS total
`;
console.log("\nFinal counts:", stats[0]);
