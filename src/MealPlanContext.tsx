import * as React from "react";
import type { Recipe } from "./types";
import {
  isMealPlanDateKey,
  loadMealPlan,
  MEAL_PLAN_UNASSIGNED_KEY,
  newPlanSlotRef,
  normalizePlanMainBeforeSide,
  portionCountOf,
  saveMealPlan,
  sortMealsMainBeforeSide,
  type MealPlanByDate,
  type PlannedMeal,
} from "./mealPlanStorage";
import { recipeSegment } from "./recipeCourse";
import { markRecipeSourcePlan, markRecipeSourcePlanMany } from "./planShoppingAuthority";

export function recipeToPlannedMeal(r: Recipe): PlannedMeal {
  return {
    id: r.id,
    title: r.title,
    kind: recipeSegment(r) === "side" ? "side" : "main",
  };
}

/**
 * One {@link removeMealAt} step as a pure transform (mirror / unassigned rules preserved).
 * Does not call {@link markRecipeSourcePlan}.
 */
function planAfterRemoveMealAt(
  prev: MealPlanByDate,
  dateKey: string,
  index: number,
): MealPlanByDate | null {
  const row = prev[dateKey];
  const removed = row?.[index];
  if (!removed) {
    return null;
  }

  const next: MealPlanByDate = { ...prev };
  const cur = [...(next[dateKey] ?? [])];
  cur.splice(index, 1);

  if (cur.length === 0) {
    delete next[dateKey];
  } else {
    next[dateKey] = sortMealsMainBeforeSide(cur);
  }
  return next;
}

type MealPlanCtx = {
  plan: MealPlanByDate;
  unassignedKey: typeof MEAL_PLAN_UNASSIGNED_KEY;
  addPlannedMealsToKey: (key: string, entries: PlannedMeal[]) => void;
  addRecipeToPlanKey: (key: string, recipe: Recipe) => void;
  removeMealAt: (dateKey: string, index: number) => void;
  moveMealToDay: (fromKey: string, fromIndex: number, toKey: string) => void;
  adjustUnassignedPortionCount: (unassignedIndex: number, delta: number) => void;
  /**
   * Ensures a calendar-day plan row has {@link PlannedMeal.planSlotRef} so cook logs can link to it.
   * Returns existing or newly assigned ref; undefined if the slot does not exist.
   */
  ensureCalendarSlotRef: (dateKey: string, planIndex: number) => string | undefined;
  /** Ensures an unassigned chip has a stable slot ref; undefined if index is out of range. */
  ensureUnassignedSlotRef: (unassignedIndex: number) => string | undefined;
};

const MealPlanContext = React.createContext<MealPlanCtx | null>(null);

export function MealPlanProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = React.useState<MealPlanByDate>(() =>
    typeof window === "undefined" ? {} : normalizePlanMainBeforeSide(loadMealPlan()),
  );

  React.useEffect(() => {
    saveMealPlan(plan);
  }, [plan]);

  const addPlannedMealsToKey = React.useCallback((key: string, entries: PlannedMeal[]) => {
    if (entries.length === 0) {
      return;
    }
    markRecipeSourcePlanMany(entries.map((e) => e.id));
    setPlan((prev) => {
      const next = { ...prev };
      const toAdd =
        key === MEAL_PLAN_UNASSIGNED_KEY
          ? entries.map((e) => ({ ...e, planSlotRef: e.planSlotRef ?? newPlanSlotRef() }))
          : entries;
      const cur = sortMealsMainBeforeSide([...(next[key] ?? []), ...toAdd]);
      next[key] = cur;
      return next;
    });
  }, []);

  const addRecipeToPlanKey = React.useCallback(
    (key: string, recipe: Recipe) => {
      addPlannedMealsToKey(key, [recipeToPlannedMeal(recipe)]);
    },
    [addPlannedMealsToKey],
  );

  const removeMealAt = React.useCallback((dateKey: string, index: number) => {
    setPlan((prev) => {
      const removed = prev[dateKey]?.[index];
      if (!removed) {
        return prev;
      }
      markRecipeSourcePlan(removed.id);
      return planAfterRemoveMealAt(prev, dateKey, index) ?? prev;
    });
  }, []);

  const moveMealToDay = React.useCallback((fromKey: string, fromIndex: number, toKey: string) => {
    setPlan((prev) => {
      const src = [...(prev[fromKey] ?? [])];
      if (fromIndex < 0 || fromIndex >= src.length) {
        return prev;
      }
      const [meal] = src.splice(fromIndex, 1);
      markRecipeSourcePlan(meal.id);
      const next: MealPlanByDate = { ...prev };

      if (src.length === 0) {
        delete next[fromKey];
      } else {
        next[fromKey] = sortMealsMainBeforeSide(src);
      }
      const pc = portionCountOf(meal);
      const movingToUnassigned = toKey === MEAL_PLAN_UNASSIGNED_KEY;
      const destSlotRef =
        movingToUnassigned ? (meal.planSlotRef ?? newPlanSlotRef()) : meal.planSlotRef;
      const stripped: PlannedMeal = {
        id: meal.id,
        title: meal.title,
        kind: meal.kind,
        ...(pc > 1 ? { portionCount: pc } : {}),
        ...(destSlotRef ? { planSlotRef: destSlotRef } : {}),
      };
      const dest = sortMealsMainBeforeSide([...(next[toKey] ?? []), stripped]);
      next[toKey] = dest;
      return next;
    });
  }, []);

  const adjustUnassignedPortionCount = React.useCallback(
    (unassignedIndex: number, delta: number) => {
      setPlan((prev) => {
        const uk = MEAL_PLAN_UNASSIGNED_KEY;
        const u = [...(prev[uk] ?? [])];
        if (unassignedIndex < 0 || unassignedIndex >= u.length) {
          return prev;
        }
        const meal = u[unassignedIndex];
        const cur = portionCountOf(meal);
        const nextCount = Math.min(99, Math.max(1, cur + delta));
        if (nextCount === cur) {
          return prev;
        }
        markRecipeSourcePlan(meal.id);

        u[unassignedIndex] = { ...meal, portionCount: nextCount };
        const next: MealPlanByDate = { ...prev, [uk]: sortMealsMainBeforeSide(u) };
        return next;
      });
    },
    [],
  );

  const ensureCalendarSlotRef = React.useCallback(
    (dateKey: string, planIndex: number): string | undefined => {
      if (!isMealPlanDateKey(dateKey)) {
        return undefined;
      }
      const cur = plan[dateKey]?.[planIndex];
      if (!cur) {
        return undefined;
      }
      if (cur.planSlotRef) {
        return cur.planSlotRef;
      }
      const ref = newPlanSlotRef();
      setPlan((prev) => {
        const row = [...(prev[dateKey] ?? [])];
        const live = row[planIndex];
        if (!live || live.id !== cur.id || live.planSlotRef) {
          return prev;
        }
        markRecipeSourcePlan(live.id);
        row[planIndex] = { ...live, planSlotRef: ref };
        return { ...prev, [dateKey]: sortMealsMainBeforeSide(row) };
      });
      return ref;
    },
    [plan],
  );

  const ensureUnassignedSlotRef = React.useCallback(
    (unassignedIndex: number): string | undefined => {
      const uk = MEAL_PLAN_UNASSIGNED_KEY;
      const cur = plan[uk]?.[unassignedIndex];
      if (!cur) {
        return undefined;
      }
      if (cur.planSlotRef) {
        return cur.planSlotRef;
      }
      const ref = newPlanSlotRef();
      setPlan((prev) => {
        const row = [...(prev[uk] ?? [])];
        const live = row[unassignedIndex];
        if (!live || live.id !== cur.id || live.planSlotRef) {
          return prev;
        }
        markRecipeSourcePlan(live.id);
        row[unassignedIndex] = { ...live, planSlotRef: ref };
        return { ...prev, [uk]: sortMealsMainBeforeSide(row) };
      });
      return ref;
    },
    [plan],
  );

  const value = React.useMemo(
    (): MealPlanCtx => ({
      plan,
      unassignedKey: MEAL_PLAN_UNASSIGNED_KEY,
      addPlannedMealsToKey,
      addRecipeToPlanKey,
      removeMealAt,
      moveMealToDay,
      adjustUnassignedPortionCount,
      ensureCalendarSlotRef,
      ensureUnassignedSlotRef,
    }),
    [
      plan,
      addPlannedMealsToKey,
      addRecipeToPlanKey,
      removeMealAt,
      moveMealToDay,
      adjustUnassignedPortionCount,
      ensureCalendarSlotRef,
      ensureUnassignedSlotRef,
    ],
  );

  return <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>;
}

export function useMealPlan(): MealPlanCtx {
  const ctx = React.useContext(MealPlanContext);
  if (!ctx) {
    throw new Error("useMealPlan must be used within MealPlanProvider");
  }
  return ctx;
}
