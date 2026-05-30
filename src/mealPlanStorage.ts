const MEAL_PLAN_KEY = "recipe-app-meal-plan-v1";

/** Reserved key: meals not yet placed on a calendar day (still on the plan + shopping). */
export const MEAL_PLAN_UNASSIGNED_KEY = "__unassigned__";

/** One slot on a day: main, side, or reference/other (shown as main styling). */
export type PlannedMeal = {
  id: string;
  title: string;
  kind: "main" | "side";
  /**
   * Stable per-slot identifier so duplicate plan rows of the same recipe are tracked
   * independently in cook history. Always present on unassigned chips; optional on
   * calendar rows (back-compat for entries written before this field existed).
   */
  planSlotRef?: string;
  /** Portions for this slot (shopping list / merge); defaults to 1. */
  portionCount?: number;
};

/** Date keys (YYYY-MM-DD) and optionally {@link MEAL_PLAN_UNASSIGNED_KEY}. */
export type MealPlanByDate = Record<string, PlannedMeal[]>;

export function isMealPlanDateKey(k: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(k);
}

export function isMealPlanStorageKey(k: string): boolean {
  return k === MEAL_PLAN_UNASSIGNED_KEY || isMealPlanDateKey(k);
}

export function newPlanSlotRef(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `slot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
}

const PORTION_MAX = 99;

export function portionCountOf(m: PlannedMeal): number {
  const n = m.portionCount;
  if (n == null || !Number.isFinite(n)) {
    return 1;
  }
  return Math.min(PORTION_MAX, Math.max(1, Math.floor(n)));
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

/** Each unassigned slot gets a unique {@link PlannedMeal.planSlotRef}. */
export function ensureUnassignedSlotRefs(plan: MealPlanByDate): MealPlanByDate {
  const uk = MEAL_PLAN_UNASSIGNED_KEY;
  const u = plan[uk];
  if (!u?.length) {
    return plan;
  }
  const next: MealPlanByDate = { ...plan };
  const nextUn = u.map((m) => (m.planSlotRef ? m : { ...m, planSlotRef: newPlanSlotRef() }));
  next[uk] = sortMealsMainBeforeSide(nextUn);
  return next;
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
  return ensureUnassignedSlotRefs(next);
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
  const ukey = MEAL_PLAN_UNASSIGNED_KEY;
  const keys = Object.keys(plan).filter((k) => k !== ukey && isMealPlanDateKey(k)).sort();
  const out: string[] = [];
  for (const k of keys) {
    for (const m of plan[k] ?? []) {
      const n = portionCountOf(m);
      for (let i = 0; i < n; i++) {
        out.push(m.id);
      }
    }
  }
  for (const m of plan[ukey] ?? []) {
    const n = portionCountOf(m);
    for (let i = 0; i < n; i++) {
      out.push(m.id);
    }
  }
  return out;
}
