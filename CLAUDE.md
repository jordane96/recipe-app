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

## Ingredient units

An ingredient's `unit` (`volume` / `weight` / `count` / `other`) is a **recommendation, not a constraint**. It sorts that family to the top of the editor's unit picker; every unit stays pickable. Real recipes measure the same ingredient different ways (cheese by the cup or the ounce, parsley by the bunch, bacon by the strip), so `shoppingMerge.ts` buckets each line by the unit **on the line** via `unitKind()`, not by the catalog kind. Lines in different families don't merge with each other — they list separately, which is intended (you can't add cups to ounces). `TO_TASTE_UNIT` (`"to taste"`) stays the amount-less sentinel; `pinch` / `strip` are count units so they can carry a quantity.

## Shopping-list staples

Staples (salt, oil, flour, and most spices) are kept out of the main aisle groups so the list is only what you actually need to buy. They collect in a collapsed **Staples** tray with per-item **+ Add** (this shop only).

- **The list lives in code**: `api/_staples.js`. `/api/ingredients` calls `isStaple(row)` and decorates each row with a `staple` boolean on read — nothing is stored. This is deliberate: the set is curated rather than per-user, so a DB column would only ever be a projection of that file, bought at the cost of a migration per environment and drift whenever one is missed. **To change the staples, edit that file and deploy — there is no migration to run.**
- `node scripts/export-staples-csv.mjs [outPath]` dumps the whole catalog with its current flag and the rule behind it, for review in a spreadsheet. It derives the flag from the same module the API uses, so it can't drift.
- **User state** is local-only, in `src/pantryStorage.ts`: `needThisTime` (staples pulled onto the current shop; cleared and restored alongside the list) and `alwaysHave`, which is now read-only — the button that set it was removed, and the shopping page keeps a one-time "show them again" recovery link for anyone who used it.

## Environments

`vercel env pull` defaults to the **development** environment, so `.env.local`'s `DATABASE_URL` points at a Neon *test branch*, not production. Anything that writes data (e.g. `scripts/fix-ingredient-units.mjs`) therefore hits the test branch by default. To target production, pass the connection string explicitly — an existing env var wins over `.env.local`:

```
DATABASE_URL="<prod url>" node scripts/fix-ingredient-units.mjs --apply
```

Code-only changes (like the staples list above) need none of this.

## Prototype-only auth escape hatch

`Owners` has no email column and stores passwords in plaintext, so there's no real password reset. Instead, a sign-in with a valid username but wrong password returns `usernameExists: true`, and the client offers a **"Sign in as … anyway"** button that posts `recoverWithoutPassword: true`. **This lets anyone who knows a username into that account** — remove the branch in `api/auth/signin.js` and the `.auth-recover` block in `AuthScreen.tsx` before the app has real users.

## Kroger grocery-ordering integration

Lets a user link their Kroger account and push the shopping list into their Kroger **cart**. Kroger's public API has **no checkout/place-order endpoint** — the user completes checkout on Kroger.com. The UI says this explicitly; keep that framing.

- **Tables** (`kroger_tokens`, `kroger_oauth_state`): created by `node scripts/migrate-kroger.mjs` (idempotent; re-run per environment).
- **Endpoints** (`api/kroger/*`, mirrored in `scripts/local-api.mjs`): `authorize`/`callback` (OAuth2 auth-code), `status`, `store`, `locations`, `match` (ingredient→product search), `cart-add` (`PUT /v1/cart/add`). To stay under Vercel Hobby's **12-function-per-deploy** limit, all seven are consolidated into a single Serverless Function: `api/kroger/[action].js` dispatches on `req.query.action` to the real handlers, which live in `_`-prefixed sibling files (underscore = not a Vercel route, so they don't count). Client URLs (`/api/kroger/status`, …) are unchanged. Shared DB/OAuth helpers are in `api/kroger/_kroger.js`.
- **Two token types**: an app-level `client_credentials` token (`product.compact`) for product/location search, and per-user `authorization_code`+refresh tokens (`cart.basic:write`) for cart writes.
- **Env vars**: `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, `KROGER_REDIRECT_URI` (add to `.env.local` and Vercel). Register the app + redirect URIs at https://developer.kroger.com.
- **HashRouter note**: OAuth redirects target `/#/order/kroger?...` so the SPA route survives the round-trip. The dev redirect URI is `http://localhost:5173/api/kroger/callback` (Vite proxies `/api` to `:3001`).
- **Frontend**: `src/KrogerOrderPage.tsx` (route `/order/kroger`) + `src/krogerClient.ts`. The shopping list's "Place order" button opens the retailer chooser (`src/PlaceOrderPage.tsx`, route `/place-order`) which routes to "Kroger brand" (`/order/kroger`) or "Safeway brand" (`/order/safeway`).
- **Multi-banner checkout**: Kroger banners (Ralphs, Harris Teeter, Fred Meyer…) share one account/cart but each checks out on its **own** storefront. `kroger_tokens.location_chain` stores the banner code (from the locations API `chain`); `krogerBanner()`/`krogerCartUrl()` in `krogerClient.ts` map it to the right site (e.g. `RALPHS`→`ralphs.com/cart`), defaulting to `kroger.com`.
