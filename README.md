# Recipe app

Mobile-friendly recipe viewer. Data is **structured**:

- `public/ingredients.json` — canonical ingredient IDs, display names, and `kind` (`volume` | `weight` | `count` | `other`) for shopping-list math.
- `public/recipes.json` — generated; do not edit by hand for day-to-day work.

**Canonical recipe source:** `data/recipes.v2.json` — `{ "version": 2, "recipes": [ … ] }` with full `Recipe` objects (`ingredientSections`, `instructions`, optional `recommendedSides`, structured steps, `stepIngredients`, `durationSeconds`, etc.).

**Edit flow:**

1. Edit `data/recipes.v2.json` (and/or `scripts/ingredientLibrary.mjs` for the ingredient catalog).
2. Run:

```bash
npm run data:publish
```

That validates ingredient IDs and `recommendedSides` links, then writes `public/ingredients.json` and `public/recipes.json`.

**Legacy / recovery:** `data/legacy-recipes-v1.json` plus `scripts/recipeIngredientSections.mjs` and `scripts/recommendedSides.mjs` are no longer used by `data:publish`. To **rebuild** `data/recipes.v2.json` from those sources (this **overwrites** hand-edited v2 data):

```bash
npm run data:migrate-legacy-to-v2
```

Then merge any edits you need before publishing again. `scripts/apply-qualitative-overrides-to-sections.mjs` still updates `recipeIngredientSections.mjs`; after using it, run `data:migrate-legacy-to-v2` if you want that merged into v2, or copy changed sections into `recipes.v2.json` manually.

## Local dev

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Create the repo [github.com/jordane96/recipe-app](https://github.com/jordane96/recipe-app) (empty, no README if you will push this folder as the root).

2. **If this folder is not inside another Git repo**, run in this directory:

   ```bash
   git init
   git add .
   git commit -m "Initial recipe viewer"
   git branch -M main
   git remote add origin https://github.com/jordane96/recipe-app.git
   git push -u origin main
   ```

   **If it lives inside a larger repo (e.g. PM-Operating-System):** clone `recipe-app` empty, then copy everything *inside* this `recipe-app` folder into that clone (not the parent repo), commit, and push—so you do not create a nested `.git` inside the parent project.

3. **GitHub → repo → Settings → Pages**  
   - Source: **Deploy from a branch**  
   - Branch: **`gh-pages`** / **root**  
   (The `gh-pages` branch is created the first time you run deploy below.)

4. Publish the built site:

   ```bash
   npm run deploy
   ```

5. After a minute or two, open **https://jordane96.github.io/recipe-app/** (hard refresh if needed).

Routing uses **hash URLs** (e.g. `/#/` meal planner, `/#/recipes` library, `/#/recipe/chicken-air-fried`) so navigation works on GitHub Pages without extra server config.

## Blank page on GitHub / Intuit Pages

1. **Hard refresh** (Ctrl+F5). Confirm **Settings → Pages** is publishing the branch/folder you think (often **`gh-pages`** root after `npm run deploy:intuit`).
2. **DevTools → Network**: confirm `index-*.js` and `recipes.json` return **200** (not 404).
3. **DevTools → Console**: note any red errors.
4. This app sets **`<base href>`** from `location.pathname` so it should work on any `/pages/USER/REPO/` path. If your host uses a **Content-Security-Policy** that blocks **inline scripts**, ask your admin or switch the inline script to a file in `public/` (no nonce).
5. **`public/.nojekyll`** is included so GitHub Pages does not run **Jekyll** on the build (which can break static sites).

## Syncing recipes from PM-Operating-System

If you keep canonical JSON in another repo, copy the bundle into the v2 source, then publish:

```bash
cp ../recipes/recipes.json data/recipes.v2.json
npm run data:publish
```

Then commit and run `npm run deploy` again.
