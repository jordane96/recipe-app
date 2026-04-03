import type { RecipeFile } from "./types";

export async function loadRecipes(): Promise<RecipeFile> {
  // Resolves against <base href> set in index.html (GitHub Enterprise Pages).
  const url = new URL("recipes.json", document.baseURI);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load recipes (${res.status})`);
  }
  return res.json() as Promise<RecipeFile>;
}
