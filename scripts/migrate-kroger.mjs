/**
 * Migration: Kroger grocery-ordering integration tables.
 *
 * Creates two tables:
 *   - kroger_tokens       per-user link to a Kroger account (OAuth tokens + chosen store)
 *   - kroger_oauth_state  short-lived, single-use CSRF state for the OAuth handshake
 *
 * Idempotent (CREATE TABLE IF NOT EXISTS) — safe to re-run, and to apply to any
 * environment (local/preview/prod) that has DATABASE_URL set.
 *
 * Usage: node scripts/migrate-kroger.mjs
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.local into process.env (same loader as scripts/local-api.mjs)
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
  console.error("DATABASE_URL is not set. Run `vercel env pull .env.local` first.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  // Per-user Kroger account link. username matches "Owners"."Username" (the app's
  // user key); no FK because the app treats username as a loose key elsewhere too.
  await sql`
    CREATE TABLE IF NOT EXISTS kroger_tokens (
      username                 text PRIMARY KEY,
      access_token             text,
      refresh_token            text,
      access_token_expires_at  timestamptz,
      location_id              text,
      location_name            text,
      updated_at               timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Single-use CSRF state for the authorization-code handshake. Rows are created
  // at /authorize and deleted at /callback; stale rows are ignored by created_at.
  await sql`
    CREATE TABLE IF NOT EXISTS kroger_oauth_state (
      state       text PRIMARY KEY,
      username    text NOT NULL,
      created_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Added after initial release: the store's Kroger banner (RALPHS, KROGER, …).
  // Checkout happens on the banner's own storefront (ralphs.com vs kroger.com),
  // even though the Kroger account cart is shared across banners.
  await sql`ALTER TABLE kroger_tokens ADD COLUMN IF NOT EXISTS location_chain text`;

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('kroger_tokens', 'kroger_oauth_state')
    ORDER BY table_name
  `;
  console.log("Kroger tables present:", tables.map((t) => t.table_name).join(", ") || "(none)");
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
