const MEAL_PLAN_KEY = "recipe-app-meal-plan-v1";

/** Reserved key: meals not yet placed on a calendar day (still on the plan + shopping). */
export const MEAL_PLAN_UNASSIGNED_KEY = "__unassigned__";

/** One slot on a day: main, side, or reference/other (shown as main styling). */
export type PlannedMeal = {
  id: string;
  title: string;
  kind: "main" | "side";
};

/** Date keys (YYYY-MM-DD) and optionally {@link MEAL_PLAN_UNASSIGNED_KEY}. */
export type MealPlanByDate = Record<string, PlannedMeal[]>;

export function isMealPlanDateKey(k: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(k);
}

export function isMealPlanStorageKey(k: string): boolean {
  return k === MEAL_PLAN_UNASSIGNED_KEY || isMealPlanDateKey(k);
}

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
    if (!isMealPlanStorageKey(k)) {
      continue;
    }
    if (arr?.length) {
      next[k] = sortMealsMainBeforeSide(arr);
    }
  }
  return next;
}

function parseStoredPlan(raw: Record<string, unknown>): MealPlanByDate {
  const plan: MealPlanByDate = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isMealPlanStorageKey(k) || !Array.isArray(v)) {
      continue;
    }
    plan[k] = v as PlannedMeal[];
  }
  return normalizePlanMainBeforeSide(plan);
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
    return parseStoredPlan(o as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function saveMealPlan(plan: MealPlanByDate) {
  localStorage.setItem(MEAL_PLAN_KEY, JSON.stringify(plan));
}

/** All planned recipe ids: calendar days (sorted), then unassigned slots. */
export function flattenPlanRecipeIdsInOrder(plan: MealPlanByDate): string[] {
  const u = MEAL_PLAN_UNASSIGNED_KEY;
  const keys = Object.keys(plan).filter((k) => k !== u && isMealPlanDateKey(k)).sort();
  const out: string[] = [];
  for (const k of keys) {
    for (const m of plan[k] ?? []) {
      out.push(m.id);
    }
  }
  for (const m of plan[u] ?? []) {
    out.push(m.id);
  }
  return out;
}
