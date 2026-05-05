#!/usr/bin/env node
/**
 * Idempotent migration: create recipe_saves join table for the Discover flow.
 * No FKs (saves dangle if a recipe is later deleted, which we don't allow today).
 *
 * Usage:
 *   node scripts/add-recipe-saves.mjs            # uses DATABASE_URL from .env.local
 *   DATABASE_URL=... node scripts/add-recipe-saves.mjs
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

await sql`
  CREATE TABLE IF NOT EXISTS recipe_saves (
    username   text         NOT NULL,
    recipe_id  text         NOT NULL,
    saved_at   timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (username, recipe_id)
  )
`;
console.log("recipe_saves table ensured.");

await sql`CREATE INDEX IF NOT EXISTS idx_recipe_saves_username ON recipe_saves(username)`;
console.log("idx_recipe_saves_username ensured.");

const [{ count }] = await sql`SELECT count(*)::int AS count FROM recipe_saves`;
console.log(`Existing rows: ${count}`);
