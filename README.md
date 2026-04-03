# Recipe app

Mobile-friendly recipe viewer. Data lives in `public/recipes.json`.

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

## Syncing recipes from PM-Operating-System

If you keep canonical JSON in another repo, copy it in:

```bash
cp ../recipes/recipes.json public/recipes.json
```

Then commit and run `npm run deploy` again.
