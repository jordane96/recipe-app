import * as React from "react";
import type { Recipe } from "./types";
import {
  loadCookHistory,
  saveCookHistory,
  type CookedMeal,
  type CookHistoryByDate,
} from "./cookHistoryStorage";
import { recipeToPlannedMeal, useMealPlan } from "./MealPlanContext";
import {
  isMealPlanDateKey,
  MEAL_PLAN_UNASSIGNED_KEY,
  type MealPlanByDate,
} from "./mealPlanStorage";

/** Max cook-log rows per recipe on a date: matches planner slots on that day, or unassigned pool if not on the day yet. */
function maxCookLogsForRecipeOnDate(
  plan: MealPlanByDate,
  dateIso: string,
  recipeId: string,
): number {
  const onDay = (plan[dateIso] ?? []).filter((m) => m.id === recipeId).length;
  const inPool = (plan[MEAL_PLAN_UNASSIGNED_KEY] ?? []).filter((m) => m.id === recipeId).length;
  if (onDay > 0) {
    return onDay;
  }
  return Math.max(1, inPool);
}

type CookHistoryCtx = {
  history: CookHistoryByDate;
  logCooked: (dateIso: string, meal: CookedMeal) => void;
  logRecipeCooked: (dateIso: string, recipe: Recipe) => void;
  removeCookedAt: (dateIso: string, index: number) => void;
};

const CookHistoryContext = React.createContext<CookHistoryCtx | null>(null);

export function CookHistoryProvider({ children }: { children: React.ReactNode }) {
  const { plan } = useMealPlan();
  const [history, setHistory] = React.useState<CookHistoryByDate>(() =>
    typeof window === "undefined" ? {} : loadCookHistory(),
  );

  React.useEffect(() => {
    saveCookHistory(history);
  }, [history]);

  const logCooked = React.useCallback(
    (dateIso: string, meal: CookedMeal) => {
      if (!isMealPlanDateKey(dateIso)) {
        return;
      }
      setHistory((prev) => {
        const row = prev[dateIso] ?? [];
        if (meal.planSlotRef) {
          if (row.some((m) => m.id === meal.id && m.planSlotRef === meal.planSlotRef)) {
            return prev;
          }
        }
        let cur = [...row];
        const cap = maxCookLogsForRecipeOnDate(plan, dateIso, meal.id);
        let historyCount = cur.filter((m) => m.id === meal.id).length;
        if (historyCount >= cap) {
          if (meal.planSlotRef) {
            const legacyIdx = cur.findIndex((m) => m.id === meal.id && m.planSlotRef === undefined);
            if (legacyIdx >= 0) {
              cur.splice(legacyIdx, 1);
              historyCount = cur.filter((m) => m.id === meal.id).length;
            }
          }
          if (historyCount >= cap) {
            return prev;
          }
        }
        const next = { ...prev };
        cur.push({ ...meal });
        next[dateIso] = cur;
        return next;
      });
    },
    [plan],
  );

  const logRecipeCooked = React.useCallback(
    (dateIso: string, recipe: Recipe) => {
      logCooked(dateIso, recipeToPlannedMeal(recipe));
    },
    [logCooked],
  );

  const removeCookedAt = React.useCallback((dateIso: string, index: number) => {
    setHistory((prev) => {
      const row = prev[dateIso];
      if (!row || index < 0 || index >= row.length) {
        return prev;
      }
      const next: CookHistoryByDate = { ...prev };
      const cur = [...row];
      cur.splice(index, 1);
      if (cur.length === 0) {
        delete next[dateIso];
      } else {
        next[dateIso] = cur;
      }
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ history, logCooked, logRecipeCooked, removeCookedAt }),
    [history, logCooked, logRecipeCooked, removeCookedAt],
  );

  return <CookHistoryContext.Provider value={value}>{children}</CookHistoryContext.Provider>;
}

export function useCookHistory(): CookHistoryCtx {
  const ctx = React.useContext(CookHistoryContext);
  if (!ctx) {
    throw new Error("useCookHistory must be used within CookHistoryProvider");
  }
  return ctx;
}
