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

export async function loadRecipeBundle(): Promise<RecipeBundle> {
  const load = async <T>(p: string): Promise<T> => {
    const res = await fetch(dataFileUrl(p));
    if (!res.ok) {
      throw new Error(`Failed to load ${p} (${res.status})`);
    }
    return res.json() as Promise<T>;
  };
  const [ingredients, recipes] = await Promise.all([
    load<IngredientsFile>("ingredients.json"),
    load<RecipeFile>("recipes.json"),
  ]);
  return { ingredients, recipes };
}
