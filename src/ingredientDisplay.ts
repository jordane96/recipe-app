import type { IngredientDef, Recipe, RecipeIngredientLine } from "./ingredientTypes";

/** Whole numbers without decimals (e.g. 1); otherwise two decimal places (e.g. 1.30). */
export function formatQuantityDisplay(n: number): string {
  if (!Number.isFinite(n)) {
    return "";
  }
  const r2 = Math.round(n * 100) / 100;
  if (Math.abs(r2 - Math.round(r2)) < 1e-8) {
    return String(Math.round(r2));
  }
  return r2.toFixed(2);
}

export function ingredientMap(ingredients: IngredientDef[]): Map<string, IngredientDef> {
  return new Map(ingredients.map((i) => [i.id, i]));
}

/**
 * Like {@link ingredientMap} but also includes recipe-scoped custom ingredient defs from one
 * or more recipes. Custom defs are merged AFTER the globals so a custom can shadow a global
 * id (last-write wins; rare in practice). Use this anywhere you render ingredient lines for a
 * recipe so custom-* ids resolve to their human names instead of leaking the raw id.
 */
export function ingredientMapWithRecipes(
  ingredients: IngredientDef[],
  recipes: ReadonlyArray<Pick<Recipe, "customIngredientDefs">>,
): Map<string, IngredientDef> {
  const m = new Map<string, IngredientDef>(ingredients.map((i) => [i.id, i]));
  for (const r of recipes) {
    for (const def of r.customIngredientDefs ?? []) {
      m.set(def.id, def);
    }
  }
  return m;
}

export function formatIngredientLine(
  line: RecipeIngredientLine,
  byId: Map<string, IngredientDef>,
): string {
  const def = byId.get(line.ingredientId);
  const name = def?.name ?? line.ingredientId;
  const note = line.note ? ` ${line.note}` : "";
  if (line.amount == null || line.unit == null) {
    return `${name}${note}`.trim();
  }
  const amt = formatQuantityDisplay(line.amount);
  return `${name} - ${amt} ${line.unit}${note}`.trim();
}
