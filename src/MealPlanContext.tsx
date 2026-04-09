import * as React from "react";
import type { Recipe } from "./types";
import {
  flattenPlanRecipeIdsInOrder,
  loadMealPlan,
  MEAL_PLAN_UNASSIGNED_KEY,
  normalizePlanMainBeforeSide,
  saveMealPlan,
  sortMealsMainBeforeSide,
  type MealPlanByDate,
  type PlannedMeal,
} from "./mealPlanStorage";
import { recipeSegment } from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";

export function recipeToPlannedMeal(r: Recipe): PlannedMeal {
  return {
    id: r.id,
    title: r.title,
    kind: recipeSegment(r) === "side" ? "side" : "main",
  };
}

type MealPlanCtx = {
  plan: MealPlanByDate;
  unassignedKey: typeof MEAL_PLAN_UNASSIGNED_KEY;
  addPlannedMealsToKey: (key: string, entries: PlannedMeal[]) => void;
  addRecipeToPlanKey: (key: string, recipe: Recipe) => void;
  removeMealAt: (dateKey: string, index: number) => void;
  moveMealToDay: (fromKey: string, fromIndex: number, toKey: string) => void;
  clearWeekDateRange: (startIso: string, endIso: string) => void;
};

const MealPlanContext = React.createContext<MealPlanCtx | null>(null);

export function MealPlanProvider({ children }: { children: React.ReactNode }) {
  const { addToList, removeFromList, hydrateShoppingIfEmpty } = useShoppingList();
  const [plan, setPlan] = React.useState<MealPlanByDate>(() =>
    typeof window === "undefined" ? {} : normalizePlanMainBeforeSide(loadMealPlan()),
  );
  const initialPlanForHydrate = React.useRef(plan);

  React.useEffect(() => {
    saveMealPlan(plan);
  }, [plan]);

  React.useEffect(() => {
    hydrateShoppingIfEmpty(flattenPlanRecipeIdsInOrder(initialPlanForHydrate.current));
  }, [hydrateShoppingIfEmpty]);

  const addPlannedMealsToKey = React.useCallback(
    (key: string, entries: PlannedMeal[]) => {
      if (entries.length === 0) {
        return;
      }
      setPlan((prev) => {
        const next = { ...prev };
        const cur = sortMealsMainBeforeSide([...(next[key] ?? []), ...entries]);
        next[key] = cur;
        return next;
      });
      for (const e of entries) {
        addToList(e.id);
      }
    },
    [addToList],
  );

  const addRecipeToPlanKey = React.useCallback(
    (key: string, recipe: Recipe) => {
      addPlannedMealsToKey(key, [recipeToPlannedMeal(recipe)]);
    },
    [addPlannedMealsToKey],
  );

  const removeMealAt = React.useCallback(
    (dateKey: string, index: number) => {
      setPlan((prev) => {
        const row = prev[dateKey];
        const removed = row?.[index];
        if (!removed) {
          return prev;
        }
        removeFromList(removed.id);
        const next: MealPlanByDate = { ...prev };
        const cur = [...(next[dateKey] ?? [])];
        cur.splice(index, 1);
        if (cur.length === 0) {
          delete next[dateKey];
        } else {
          next[dateKey] = sortMealsMainBeforeSide(cur);
        }
        return next;
      });
    },
    [removeFromList],
  );

  const moveMealToDay = React.useCallback((fromKey: string, fromIndex: number, toKey: string) => {
    setPlan((prev) => {
      const src = [...(prev[fromKey] ?? [])];
      if (fromIndex < 0 || fromIndex >= src.length) {
        return prev;
      }
      const [meal] = src.splice(fromIndex, 1);
      const next: MealPlanByDate = { ...prev };
      if (src.length === 0) {
        delete next[fromKey];
      } else {
        next[fromKey] = sortMealsMainBeforeSide(src);
      }
      const dest = sortMealsMainBeforeSide([...(next[toKey] ?? []), meal]);
      next[toKey] = dest;
      return next;
    });
  }, []);

  const clearWeekDateRange = React.useCallback(
    (startIso: string, endIso: string) => {
      setPlan((prev) => {
        const mealsDropped: PlannedMeal[] = [];
        for (const [key, meals] of Object.entries(prev)) {
          if (key >= startIso && key <= endIso) {
            mealsDropped.push(...meals);
          }
        }
        const next: MealPlanByDate = { ...prev };
        for (const k of Object.keys(next)) {
          if (k >= startIso && k <= endIso) {
            delete next[k];
          }
        }
        for (const m of mealsDropped) {
          removeFromList(m.id);
        }
        return next;
      });
    },
    [removeFromList],
  );

  const value = React.useMemo(
    (): MealPlanCtx => ({
      plan,
      unassignedKey: MEAL_PLAN_UNASSIGNED_KEY,
      addPlannedMealsToKey,
      addRecipeToPlanKey,
      removeMealAt,
      moveMealToDay,
      clearWeekDateRange,
    }),
    [plan, addPlannedMealsToKey, addRecipeToPlanKey, removeMealAt, moveMealToDay, clearWeekDateRange],
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
