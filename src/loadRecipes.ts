import type { IngredientsFile, RecipeBundle, RecipeFile } from "./ingredientTypes";

export async function loadRecipeBundle(): Promise<RecipeBundle> {
  const base = import.meta.env.BASE_URL;
  const path = (p: string) =>
    `${base}${p}`.replace(/\/{2,}/g, "/").replace(":/", "://");
  const load = async <T>(p: string): Promise<T> => {
    const res = await fetch(path(p));
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
