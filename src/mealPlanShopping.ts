import type { CookHistoryByDate } from "./cookHistoryStorage";
import { buildWeekKeys, startOfWeekMonday } from "./mealPlanDates";
import { isDaySlotCooked, isUnassignedSlotCooked } from "./mealPlannerCookUi";
import {
  flattenPlanRecipeIdsInOrder,
  isMealPlanDateKey,
  MEAL_PLAN_UNASSIGNED_KEY,
  portionCountOf,
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

/**
 * Week keys used for legacy unassigned cook ordinals in {@link shoppingDiscrepancies}.
 * Anchors to the earliest calendar day in the plan when present; otherwise this week (local).
 */
export function weekKeysAnchoredToPlan(plan: MealPlanByDate): string[] {
  const keys = Object.keys(plan).filter((k) => isMealPlanDateKey(k)).sort();
  if (keys.length === 0) {
    return buildWeekKeys(startOfWeekMonday(new Date()));
  }
  return buildWeekKeys(startOfWeekMonday(new Date(`${keys[0]}T12:00:00`)));
}

/**
 * Same iteration order as {@link flattenPlanRecipeIdsInOrder}, but omits slots that are
 * already logged as cooked (they no longer need to appear on the shopping list).
 */
export function flattenUncookedPlanRecipeIdsInOrder(
  plan: MealPlanByDate,
  history: CookHistoryByDate,
  weekKeys: string[],
): string[] {
  const ukey = MEAL_PLAN_UNASSIGNED_KEY;
  const unassigned = plan[ukey] ?? [];
  const mirroredRefByDay = new Map<string, Set<string>>();
  for (const m of unassigned) {
    if (m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) && m.planSlotRef) {
      const d = m.scheduledForDay;
      const s = mirroredRefByDay.get(d) ?? new Set<string>();
      s.add(m.planSlotRef);
      mirroredRefByDay.set(d, s);
    }
  }

  const keys = Object.keys(plan).filter((k) => k !== ukey && isMealPlanDateKey(k)).sort();
  const out: string[] = [];
  for (const k of keys) {
    const meals = plan[k] ?? [];
    const mirrored = mirroredRefByDay.get(k);
    for (let idx = 0; idx < meals.length; idx++) {
      const m = meals[idx]!;
      if (m.planSlotRef && mirrored?.has(m.planSlotRef)) {
        continue;
      }
      if (isDaySlotCooked(history, k, meals, idx, m.id)) {
        continue;
      }
      const n = portionCountOf(m);
      for (let i = 0; i < n; i++) {
        out.push(m.id);
      }
    }
  }
  for (let ui = 0; ui < unassigned.length; ui++) {
    const m = unassigned[ui]!;
    if (isUnassignedSlotCooked(history, weekKeys, unassigned, ui, m.id)) {
      continue;
    }
    const n = portionCountOf(m);
    for (let i = 0; i < n; i++) {
      out.push(m.id);
    }
  }
  return out;
}

export function expectedRecipeCountsFromPlanUncooked(
  plan: MealPlanByDate,
  history: CookHistoryByDate,
  weekKeys: string[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of flattenUncookedPlanRecipeIdsInOrder(plan, history, weekKeys)) {
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

export type ShoppingDiscrepanciesOpts = {
  history: CookHistoryByDate;
  weekKeys: string[];
};

export function shoppingDiscrepancies(
  plan: MealPlanByDate,
  selectedIds: string[],
  opts?: ShoppingDiscrepanciesOpts,
): RecipeShoppingDiscrepancy[] {
  const exp = opts
    ? expectedRecipeCountsFromPlanUncooked(plan, opts.history, opts.weekKeys)
    : expectedRecipeCountsFromPlan(plan);
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
