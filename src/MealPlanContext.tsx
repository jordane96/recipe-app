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
import {
  clearRecipeCountSource,
  markRecipeSourcePlan,
  markRecipeSourcePlanMany,
} from "./planShoppingAuthority";
import { reconcilePlanRecipeSlotCount } from "./mealPlanSlotSync";

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
  /** Keep unassigned chip; add mirror on calendar and show date on chip. */
  assignUnassignedToCalendarDay: (unassignedIndex: number, dayKey: string) => void;
  /** Remove scheduled day and calendar mirror; chip goes back to “Set day” only. */
  clearUnassignedScheduledDay: (unassignedIndex: number) => void;
  adjustUnassignedPortionCount: (unassignedIndex: number, delta: number) => void;
  clearWeekDateRange: (startIso: string, endIso: string) => void;
  /** Set plan slot count for a recipe to match the shopping list (list is source of truth). */
  syncPlanRecipeSlotsToShoppingCount: (
    recipeId: string,
    targetCount: number,
    meta: { title: string; kind: "main" | "side" },
  ) => void;
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
      const row = prev[dateKey];
      const removed = row?.[index];
      if (!removed) {
        return prev;
      }
      markRecipeSourcePlan(removed.id);
      const uk = MEAL_PLAN_UNASSIGNED_KEY;

      const next: MealPlanByDate = { ...prev };
        const cur = [...(next[dateKey] ?? [])];
        cur.splice(index, 1);

        if (dateKey === uk && removed.scheduledForDay && removed.planSlotRef && isMealPlanDateKey(removed.scheduledForDay)) {
          const d = removed.scheduledForDay;
          const drow = [...(next[d] ?? [])];
          const di = drow.findIndex((x) => x.planSlotRef === removed.planSlotRef);
          if (di >= 0) {
            drow.splice(di, 1);
            if (drow.length === 0) {
              delete next[d];
            } else {
              next[d] = sortMealsMainBeforeSide(drow);
            }
          }
        }

        if (dateKey !== uk && removed.planSlotRef) {
          const urow = [...(next[uk] ?? [])];
          const ui = urow.findIndex((x) => x.planSlotRef === removed.planSlotRef);
          if (ui >= 0) {
            const orig = urow[ui];
            urow[ui] = {
              id: orig.id,
              title: orig.title,
              kind: orig.kind,
              planSlotRef: orig.planSlotRef,
              portionCount: orig.portionCount,
            };
            next[uk] = sortMealsMainBeforeSide(urow);
          }
        }

        if (cur.length === 0) {
          delete next[dateKey];
        } else {
          next[dateKey] = sortMealsMainBeforeSide(cur);
        }
        return next;
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

      if (
        fromKey === MEAL_PLAN_UNASSIGNED_KEY &&
        meal.scheduledForDay &&
        meal.planSlotRef &&
        isMealPlanDateKey(meal.scheduledForDay)
      ) {
        const d = meal.scheduledForDay;
        const crow = [...(next[d] ?? [])];
        const ri = crow.findIndex((x) => x.planSlotRef === meal.planSlotRef);
        if (ri >= 0) {
          crow.splice(ri, 1);
          if (crow.length === 0) {
            delete next[d];
          } else {
            next[d] = sortMealsMainBeforeSide(crow);
          }
        }
      }

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

  const assignUnassignedToCalendarDay = React.useCallback(
    (unassignedIndex: number, dayKey: string) => {
      if (!isMealPlanDateKey(dayKey)) {
        return;
      }
      setPlan((prev) => {
        const uk = MEAL_PLAN_UNASSIGNED_KEY;
        const u = [...(prev[uk] ?? [])];
        if (unassignedIndex < 0 || unassignedIndex >= u.length) {
          return prev;
        }
        const meal = u[unassignedIndex];
        markRecipeSourcePlan(meal.id);
        const ref = meal.planSlotRef ?? newPlanSlotRef();
        const prevDay = meal.scheduledForDay;
        const next: MealPlanByDate = { ...prev };

        if (
          prevDay &&
          isMealPlanDateKey(prevDay) &&
          prevDay !== dayKey &&
          meal.planSlotRef
        ) {
          const row = [...(next[prevDay] ?? [])];
          const ri = row.findIndex((x) => x.planSlotRef === ref);
          if (ri >= 0) {
            row.splice(ri, 1);
            if (row.length === 0) {
              delete next[prevDay];
            } else {
              next[prevDay] = sortMealsMainBeforeSide(row);
            }
          }
        }

        const destRow = [...(next[dayKey] ?? [])];
        const alreadyMirrored = destRow.some((x) => x.planSlotRef === ref);
        if (!alreadyMirrored) {
          const calendarCopy: PlannedMeal = {
            id: meal.id,
            title: meal.title,
            kind: meal.kind,
            planSlotRef: ref,
            portionCount: portionCountOf(meal),
          };
          destRow.push(calendarCopy);
          next[dayKey] = sortMealsMainBeforeSide(destRow);
        }

        u[unassignedIndex] = {
          ...meal,
          scheduledForDay: dayKey,
          planSlotRef: ref,
        };
        next[uk] = sortMealsMainBeforeSide(u);
        return next;
      });
    },
    [],
  );

  const clearUnassignedScheduledDay = React.useCallback((unassignedIndex: number) => {
    setPlan((prev) => {
      const uk = MEAL_PLAN_UNASSIGNED_KEY;
      const u = [...(prev[uk] ?? [])];
      if (unassignedIndex < 0 || unassignedIndex >= u.length) {
        return prev;
      }
      const meal = u[unassignedIndex];
      if (!meal.scheduledForDay || !isMealPlanDateKey(meal.scheduledForDay)) {
        return prev;
      }
      markRecipeSourcePlan(meal.id);

      const next: MealPlanByDate = { ...prev };

      if (meal.planSlotRef) {
        const d = meal.scheduledForDay;
        const drow = [...(next[d] ?? [])];
        const di = drow.findIndex((x) => x.planSlotRef === meal.planSlotRef);
        if (di >= 0) {
          drow.splice(di, 1);
          if (drow.length === 0) {
            delete next[d];
          } else {
            next[d] = sortMealsMainBeforeSide(drow);
          }
        }
      }

      u[unassignedIndex] = {
        id: meal.id,
        title: meal.title,
        kind: meal.kind,
        planSlotRef: meal.planSlotRef,
        portionCount: meal.portionCount,
      };
      next[uk] = sortMealsMainBeforeSide(u);
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

        if (
          meal.planSlotRef &&
          meal.scheduledForDay &&
          isMealPlanDateKey(meal.scheduledForDay)
        ) {
          const d = meal.scheduledForDay;
          const drow = [...(next[d] ?? [])];
          const di = drow.findIndex((x) => x.planSlotRef === meal.planSlotRef);
          if (di >= 0) {
            drow[di] = { ...drow[di], portionCount: nextCount };
            next[d] = sortMealsMainBeforeSide(drow);
          }
        }
        return next;
      });
    },
    [],
  );

  const syncPlanRecipeSlotsToShoppingCount = React.useCallback(
    (recipeId: string, targetCount: number, meta: { title: string; kind: "main" | "side" }) => {
      setPlan((prev) => reconcilePlanRecipeSlotCount(prev, recipeId, targetCount, meta));
      clearRecipeCountSource(recipeId);
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

  const clearWeekDateRange = React.useCallback((startIso: string, endIso: string) => {
    setPlan((prev) => {
      const touched = new Set<string>();
      for (const k of Object.keys(prev)) {
        if (isMealPlanDateKey(k) && k >= startIso && k <= endIso) {
          for (const m of prev[k] ?? []) {
            touched.add(m.id);
          }
        }
      }
      const uk0 = MEAL_PLAN_UNASSIGNED_KEY;
      for (const m of prev[uk0] ?? []) {
        if (m.scheduledForDay && m.scheduledForDay >= startIso && m.scheduledForDay <= endIso) {
          touched.add(m.id);
        }
      }
      markRecipeSourcePlanMany([...touched]);

      const next: MealPlanByDate = { ...prev };
      for (const k of Object.keys(next)) {
        if (isMealPlanDateKey(k) && k >= startIso && k <= endIso) {
          delete next[k];
        }
      }
      const uk = MEAL_PLAN_UNASSIGNED_KEY;
      const urow = next[uk];
      if (urow?.length) {
        next[uk] = sortMealsMainBeforeSide(
          urow.map((m) => {
            if (
              m.scheduledForDay &&
              m.scheduledForDay >= startIso &&
              m.scheduledForDay <= endIso
            ) {
              return {
                id: m.id,
                title: m.title,
                kind: m.kind,
                planSlotRef: m.planSlotRef,
                portionCount: m.portionCount,
              };
            }
            return m;
          }),
        );
      }
      return next;
    });
  }, []);

  const value = React.useMemo(
    (): MealPlanCtx => ({
      plan,
      unassignedKey: MEAL_PLAN_UNASSIGNED_KEY,
      addPlannedMealsToKey,
      addRecipeToPlanKey,
      removeMealAt,
      moveMealToDay,
      assignUnassignedToCalendarDay,
      clearUnassignedScheduledDay,
      adjustUnassignedPortionCount,
      clearWeekDateRange,
      syncPlanRecipeSlotsToShoppingCount,
      ensureCalendarSlotRef,
      ensureUnassignedSlotRef,
    }),
    [
      plan,
      addPlannedMealsToKey,
      addRecipeToPlanKey,
      removeMealAt,
      moveMealToDay,
      assignUnassignedToCalendarDay,
      clearUnassignedScheduledDay,
      adjustUnassignedPortionCount,
      clearWeekDateRange,
      syncPlanRecipeSlotsToShoppingCount,
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
