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
import { loadCookHistory } from "./cookHistoryStorage";
import { iso } from "./mealPlanDates";

export function recipeToPlannedMeal(r: Recipe): PlannedMeal {
  return {
    id: r.id,
    title: r.title,
    kind: recipeSegment(r) === "side" ? "side" : "main",
    // portionCount now carries the slot's servings. Default to the recipe's base servings so a
    // newly-added menu item starts "as written"; falls through to 1 when the recipe has no base.
    ...(typeof r.servings === "number" && r.servings > 0 ? { portionCount: r.servings } : {}),
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
  /** Adjust a calendar-day slot's servings (clamped 1–99). */
  adjustCalendarPortionCount: (dateKey: string, planIndex: number, delta: number) => void;
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

  // On load, drop calendar-day plan slots whose day has already passed and that were never cooked.
  // (Planning a meal also copies it to the menu pool; that menu copy is kept — only the dated
  // calendar copy is pruned here.) Runs once on mount.
  React.useEffect(() => {
    const hist = loadCookHistory();
    const today = iso(new Date());
    setPlan((prev) => {
      let changed = false;
      const next: MealPlanByDate = { ...prev };
      for (const [dateKey, meals] of Object.entries(prev)) {
        if (dateKey === MEAL_PLAN_UNASSIGNED_KEY || !isMealPlanDateKey(dateKey)) {
          continue;
        }
        if (dateKey >= today) {
          continue;
        }
        const logged = hist[dateKey] ?? [];
        const isCooked = (m: PlannedMeal) => {
          if (m.planSlotRef && logged.some((l) => l.planSlotRef === m.planSlotRef)) {
            return true;
          }
          return logged.some((l) => l.planSlotRef == null && l.id === m.id);
        };
        const kept = meals.filter(isCooked);
        if (kept.length !== meals.length) {
          changed = true;
          if (kept.length === 0) {
            delete next[dateKey];
          } else {
            next[dateKey] = kept;
          }
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const adjustCalendarPortionCount = React.useCallback(
    (dateKey: string, planIndex: number, delta: number) => {
      setPlan((prev) => {
        const row = [...(prev[dateKey] ?? [])];
        if (planIndex < 0 || planIndex >= row.length) {
          return prev;
        }
        const meal = row[planIndex];
        const cur = portionCountOf(meal);
        const nextCount = Math.min(99, Math.max(1, cur + delta));
        if (nextCount === cur) {
          return prev;
        }
        markRecipeSourcePlan(meal.id);
        row[planIndex] = { ...meal, portionCount: nextCount };
        return { ...prev, [dateKey]: sortMealsMainBeforeSide(row) };
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
      adjustCalendarPortionCount,
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
      adjustCalendarPortionCount,
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
