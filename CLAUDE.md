# recipe-app — agent notes

## Running locally

This project does **not** use `vercel dev`. The intended local workflow is two processes:

1. **Vite** on `http://localhost:5173` — `npm run dev`
2. **Mock API** on `http://localhost:3001` — `node scripts/local-api.mjs`

`vite.config.ts` proxies `/api/*` → `localhost:3001`, where `scripts/local-api.mjs` re-implements the Vercel Functions in `api/` against the same Neon DB.

**Before first run:** pull env vars with `vercel env pull .env.local` (needs `vercel link` first). `local-api.mjs` reads `DATABASE_URL` from `.env.local`.

If you start only `npm run dev` (no API), `/api/*` requests return `index.html` and the app fails with a JSON parse error like *"Unexpected token 'i', \"import { n\"… is not valid JSON"*.

## Personal / local-only notes

If `CLAUDE.local.md` exists at the repo root, read it — it holds the current user's personal dev preferences (e.g. auto-login credentials, workflow shortcuts) that are gitignored and not safe to commit.

## Claude Code preview

`.claude/launch.json` is configured to launch the Vite server on port 5173 via `npm run dev`. Remember to start `node scripts/local-api.mjs` separately as a background task — the preview tool only manages the Vite process.
