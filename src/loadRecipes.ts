import type { RecipeFile } from "./types";

export async function loadRecipes(): Promise<RecipeFile> {
  const base = import.meta.env.BASE_URL;
  const path = `${base}recipes.json`.replace(/\/{2,}/g, "/");
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load recipes (${res.status})`);
  }
  return res.json() as Promise<RecipeFile>;
}
