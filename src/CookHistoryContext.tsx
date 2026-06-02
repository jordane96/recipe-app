import * as React from "react";
import type { Recipe } from "./types";
import {
  loadCookHistory,
  saveCookHistory,
  type CookedMeal,
  type CookHistoryByDate,
} from "./cookHistoryStorage";
import { isMealPlanDateKey } from "./mealPlanStorage";
import { recipeSegment } from "./recipeCourse";

type CookHistoryCtx = {
  history: CookHistoryByDate;
  logCooked: (dateIso: string, meal: CookedMeal) => void;
  logRecipeCooked: (dateIso: string, recipe: Recipe) => void;
  removeCookedAt: (dateIso: string, index: number) => void;
  /** Set the servings recorded for a cook-log entry (clamped 1–99). */
  setCookedServingsAt: (dateIso: string, index: number, servings: number) => void;
};

const CookHistoryContext = React.createContext<CookHistoryCtx | null>(null);

export function CookHistoryProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = React.useState<CookHistoryByDate>(() =>
    typeof window === "undefined" ? {} : loadCookHistory(),
  );

  React.useEffect(() => {
    saveCookHistory(history);
  }, [history]);

  const logCooked = React.useCallback((dateIso: string, meal: CookedMeal) => {
    if (!isMealPlanDateKey(dateIso)) return;
    setHistory((prev) => {
      const next = { ...prev };
      const entry: CookedMeal = {
        id: meal.id,
        title: meal.title,
        kind: meal.kind,
        ...(meal.planSlotRef ? { planSlotRef: meal.planSlotRef } : {}),
        ...(typeof meal.servings === "number" && meal.servings > 0
          ? { servings: meal.servings }
          : {}),
      };
      next[dateIso] = [...(prev[dateIso] ?? []), entry];
      saveCookHistory(next);
      return next;
    });
  }, []);

  const logRecipeCooked = React.useCallback(
    (dateIso: string, recipe: Recipe) => {
      logCooked(dateIso, {
        id: recipe.id,
        title: recipe.title,
        kind: recipeSegment(recipe) === "side" ? "side" : "main",
        ...(typeof recipe.servings === "number" && recipe.servings > 0
          ? { servings: recipe.servings }
          : {}),
      });
    },
    [logCooked],
  );

  const setCookedServingsAt = React.useCallback(
    (dateIso: string, index: number, servings: number) => {
      setHistory((prev) => {
        const row = prev[dateIso];
        if (!row || index < 0 || index >= row.length) return prev;
        const clamped = Math.min(99, Math.max(1, Math.floor(servings)));
        if ((row[index].servings ?? 1) === clamped) return prev;
        const next: CookHistoryByDate = { ...prev };
        const cur = [...row];
        cur[index] = { ...cur[index], servings: clamped };
        next[dateIso] = cur;
        saveCookHistory(next);
        return next;
      });
    },
    [],
  );

  const removeCookedAt = React.useCallback((dateIso: string, index: number) => {
    setHistory((prev) => {
      const row = prev[dateIso];
      if (!row || index < 0 || index >= row.length) return prev;
      const next: CookHistoryByDate = { ...prev };
      const cur = [...row];
      cur.splice(index, 1);
      if (cur.length === 0) {
        delete next[dateIso];
      } else {
        next[dateIso] = cur;
      }
      saveCookHistory(next);
      return next;
    });
  }, []);

  const value = React.useMemo(
    () => ({ history, logCooked, logRecipeCooked, removeCookedAt, setCookedServingsAt }),
    [history, logCooked, logRecipeCooked, removeCookedAt, setCookedServingsAt],
  );

  return <CookHistoryContext.Provider value={value}>{children}</CookHistoryContext.Provider>;
}

export function useCookHistory(): CookHistoryCtx {
  const ctx = React.useContext(CookHistoryContext);
  if (!ctx) throw new Error("useCookHistory must be used within CookHistoryProvider");
  return ctx;
}
