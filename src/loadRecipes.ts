import type { IngredientsFile, RecipeBundle, RecipeFile } from "./ingredientTypes";

/** Resolve JSON URLs against the document base (GitHub Pages project paths, trailing slashes). */
function dataFileUrl(file: string): string {
  const name = file.replace(/^\.\//, "");
  if (typeof document !== "undefined" && document.baseURI) {
    return new URL(name, document.baseURI).href;
  }
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${name}`.replace(/\/{2,}/g, "/").replace(":/", "://");
}

async function loadJson<T>(p: string): Promise<T> {
  const res = await fetch(dataFileUrl(p));
  if (!res.ok) {
    throw new Error(`Failed to load ${p} (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function loadRecipeBundle(currentUser?: string): Promise<RecipeBundle> {
  const recipesPath = currentUser
    ? `/api/recipes?user=${encodeURIComponent(currentUser)}`
    : "/api/recipes";
  const [ingredients, recipes] = await Promise.all([
    loadJson<IngredientsFile>("/api/ingredients"),
    loadJson<RecipeFile>(recipesPath),
  ]);
  return { ingredients, recipes };
}

/**
 * Reload just the ingredient catalog. Use after a recipe save (the editor / AI parser may
 * have created new ingredient rows in the DB; without this the client cache is stale and
 * fresh ids fall back to displaying their raw slug instead of the human name).
 */
export async function loadIngredientsFile(): Promise<IngredientsFile> {
  return loadJson<IngredientsFile>("/api/ingredients");
}
