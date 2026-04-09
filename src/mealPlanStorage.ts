const MEAL_PLAN_KEY = "recipe-app-meal-plan-v1";

/** One slot on a day: main, side, or reference/other (shown as main styling). */
export type PlannedMeal = {
  id: string;
  title: string;
  kind: "main" | "side";
};

export type MealPlanByDate = Record<string, PlannedMeal[]>;

/** Mains first, then sides; stable within each group. */
export function sortMealsMainBeforeSide(meals: PlannedMeal[]): PlannedMeal[] {
  return meals
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ra = a.m.kind === "side" ? 1 : 0;
      const rb = b.m.kind === "side" ? 1 : 0;
      if (ra !== rb) {
        return ra - rb;
      }
      return a.i - b.i;
    })
    .map(({ m }) => m);
}

export function normalizePlanMainBeforeSide(plan: MealPlanByDate): MealPlanByDate {
  const next: MealPlanByDate = {};
  for (const [k, arr] of Object.entries(plan)) {
    if (arr?.length) {
      next[k] = sortMealsMainBeforeSide(arr);
    }
  }
  return next;
}

export function loadMealPlan(): MealPlanByDate {
  try {
    const s = localStorage.getItem(MEAL_PLAN_KEY);
    if (!s) {
      return {};
    }
    const o = JSON.parse(s) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) {
      return {};
    }
    return o as MealPlanByDate;
  } catch {
    return {};
  }
}

export function saveMealPlan(plan: MealPlanByDate) {
  localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(plan));
}

/** All planned recipe ids in date order (duplicates = multiple meals / portions). */
export function flattenPlanRecipeIdsInOrder(plan: MealPlanByDate): string[] {
  const keys = Object.keys(plan).sort();
  const out: string[] = [];
  for (const k of keys) {
    for (const m of plan[k] ?? []) {
      out.push(m.id);
    }
  }
  return out;
}
