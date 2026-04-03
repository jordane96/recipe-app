# Recipe app

Mobile-friendly recipe viewer. Data is **structured**:

- `public/ingredients.json` — canonical ingredient IDs, display names, and `kind` (`volume` | `weight` | `count` | `other`) for shopping-list math.
- `public/recipes.json` — `version: 2` recipes with `ingredientSections` (groups of `{ ingredientId, amount, unit, note? }`).

**Edit flow:** change `scripts/ingredientLibrary.mjs` and/or `scripts/recipeIngredientSections.mjs`, then run:

```bash
npm run data:publish
```

That reads `data/legacy-recipes-v1.json` for recipe metadata (title, tags, instructions, URLs) and writes both JSON files under `public/`. To refresh legacy metadata only, update `data/legacy-recipes-v1.json` first (or replace it with a v1 export), then publish again.

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

Routing uses **hash URLs** (e.g. `/#/recipe/chicken-air-fried`) so navigation works on GitHub Pages without extra server config.

## Blank page on GitHub / Intuit Pages

1. **Hard refresh** (Ctrl+F5). Confirm **Settings → Pages** is publishing the branch/folder you think (often **`gh-pages`** root after `npm run deploy:intuit`).
2. **DevTools → Network**: confirm `index-*.js` and `recipes.json` return **200** (not 404).
3. **DevTools → Console**: note any red errors.
4. This app sets **`<base href>`** from `location.pathname` so it should work on any `/pages/USER/REPO/` path. If your host uses a **Content-Security-Policy** that blocks **inline scripts**, ask your admin or switch the inline script to a file in `public/` (no nonce).
5. **`public/.nojekyll`** is included so GitHub Pages does not run **Jekyll** on the build (which can break static sites).

## Syncing recipes from PM-Operating-System

If you keep canonical JSON in another repo, copy it in:

```bash
cp ../recipes/recipes.json public/recipes.json
```

Then commit and run `npm run deploy` again.
