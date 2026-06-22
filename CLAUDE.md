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

## Kroger grocery-ordering integration

Lets a user link their Kroger account and push the shopping list into their Kroger **cart**. Kroger's public API has **no checkout/place-order endpoint** — the user completes checkout on Kroger.com. The UI says this explicitly; keep that framing.

- **Tables** (`kroger_tokens`, `kroger_oauth_state`): created by `node scripts/migrate-kroger.mjs` (idempotent; re-run per environment).
- **Endpoints** (`api/kroger/*`, mirrored in `scripts/local-api.mjs`): `authorize`/`callback` (OAuth2 auth-code), `status`, `store`, `locations`, `match` (ingredient→product search), `cart-add` (`PUT /v1/cart/add`). Shared helpers in `api/kroger/_kroger.js` (underscore = not a Vercel route).
- **Two token types**: an app-level `client_credentials` token (`product.compact`) for product/location search, and per-user `authorization_code`+refresh tokens (`cart.basic:write`) for cart writes.
- **Env vars**: `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `KROGER_REDIRECT_URI` (add to `.env.local` and Vercel). Register the app + redirect URIs at https://developer.kroger.com.
- **HashRouter note**: OAuth redirects target `/#/place-order?...` so the SPA route survives the round-trip. The dev redirect URI is `http://localhost:5173/api/kroger/callback` (Vite proxies `/api` to `:3001`).
- **Frontend**: `src/KrogerOrderPage.tsx` (route `/place-order`) + `src/krogerClient.ts`. Entry point is the shopping list's "Place order" button.
- **Multi-banner checkout**: Kroger banners (Ralphs, Harris Teeter, Fred Meyer…) share one account/cart but each checks out on its **own** storefront. `kroger_tokens.location_chain` stores the banner code (from the locations API `chain`); `krogerBanner()`/`krogerCartUrl()` in `krogerClient.ts` map it to the right site (e.g. `RALPHS`→`ralphs.com/cart`), defaulting to `kroger.com`.
