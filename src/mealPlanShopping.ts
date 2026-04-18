import {
  flattenPlanRecipeIdsInOrder,
  type MealPlanByDate,
} from "./mealPlanStorage";

/** Count shopping slots per recipe id from the flat list order. */
export function expectedRecipeCountsFromPlan(plan: MealPlanByDate): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of flattenPlanRecipeIdsInOrder(plan)) {
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export function actualRecipeCountsFromShopping(selectedIds: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of selectedIds) {
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export type RecipeShoppingDiscrepancy = {
  recipeId: string;
  expected: number;
  actual: number;
  /** actual − expected (negative = short on list, positive = extra on list) */
  delta: number;
};

export function shoppingDiscrepancies(
  plan: MealPlanByDate,
  selectedIds: string[],
): RecipeShoppingDiscrepancy[] {
  const exp = expectedRecipeCountsFromPlan(plan);
  const act = actualRecipeCountsFromShopping(selectedIds);
  const ids = new Set<string>([...exp.keys(), ...act.keys()]);
  const out: RecipeShoppingDiscrepancy[] = [];
  for (const recipeId of ids) {
    const expected = exp.get(recipeId) ?? 0;
    const actual = act.get(recipeId) ?? 0;
    if (expected !== actual) {
      out.push({ recipeId, expected, actual, delta: actual - expected });
    }
  }
  return out.sort((a, b) => a.recipeId.localeCompare(b.recipeId));
}

export function expectedCountForRecipe(plan: MealPlanByDate, recipeId: string): number {
  return expectedRecipeCountsFromPlan(plan).get(recipeId) ?? 0;
}
