import type { CookHistoryByDate } from "./cookHistoryStorage";
import type { PlannedMeal } from "./mealPlanStorage";

export function historyCountForRecipeOnDay(
  history: CookHistoryByDate,
  dateKey: string,
  recipeId: string,
): number {
  return (history[dateKey] ?? []).filter((x) => x.id === recipeId).length;
}

/** 1-based index of this chip among same-recipe slots on this list (inclusive of idx). */
export function slotOrdinalAmongSameRecipe(
  meals: PlannedMeal[],
  idx: number,
  recipeId: string,
): number {
  return meals.slice(0, idx + 1).filter((x) => x.id === recipeId).length;
}

export function weekHistoryCountForRecipe(
  history: CookHistoryByDate,
  weekKeys: string[],
  recipeId: string,
): number {
  let n = 0;
  for (const k of weekKeys) {
    n += (history[k] ?? []).filter((x) => x.id === recipeId).length;
  }
  return n;
}

function weekLegacyCookCountForRecipe(
  history: CookHistoryByDate,
  weekKeys: string[],
  recipeId: string,
): number {
  let n = 0;
  for (const k of weekKeys) {
    for (const e of history[k] ?? []) {
      if (e.id === recipeId && e.planSlotRef === undefined) {
        n++;
      }
    }
  }
  return n;
}

/** True if any cook-log row (any date) matches this plan slot ref. */
export function historyHasCookLogForSlotRef(
  history: CookHistoryByDate,
  recipeId: string,
  planSlotRef: string,
): boolean {
  for (const row of Object.values(history)) {
    if (row?.some((e) => e.id === recipeId && e.planSlotRef === planSlotRef)) {
      return true;
    }
  }
  return false;
}

export function isDaySlotCooked(
  history: CookHistoryByDate,
  dateKey: string,
  meals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  const slot = meals[idx];
  if (!slot || slot.id !== recipeId) {
    return false;
  }
  const row = history[dateKey] ?? [];
  if (slot.planSlotRef) {
    return row.some(
      (e) => e.id === recipeId && e.planSlotRef === slot.planSlotRef,
    );
  }
  const ordinal = slotOrdinalAmongSameRecipe(meals, idx, recipeId);
  const count = historyCountForRecipeOnDay(history, dateKey, recipeId);
  return count >= ordinal;
}

export function isUnassignedSlotCooked(
  history: CookHistoryByDate,
  weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  const m = unassignedMeals[idx];
  if (!m || m.id !== recipeId) {
    return false;
  }

  if (m.planSlotRef) {
    if (historyHasCookLogForSlotRef(history, recipeId, m.planSlotRef)) {
      return true;
    }
    const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, idx, recipeId);
    return weekLegacyCookCountForRecipe(history, weekKeys, recipeId) >= ordinal;
  }

  const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, idx, recipeId);
  return weekHistoryCountForRecipe(history, weekKeys, recipeId) >= ordinal;
}

/** Index in `history[dateIso]` for this chip’s cook log. */
export function findDaySlotHistoryIndex(
  history: CookHistoryByDate,
  dateIso: string,
  meals: PlannedMeal[],
  chipIdx: number,
  recipeId: string,
): number | null {
  const slot = meals[chipIdx];
  if (!slot || slot.id !== recipeId) {
    return null;
  }
  const row = history[dateIso] ?? [];
  if (slot.planSlotRef) {
    const i = row.findIndex(
      (e) => e.id === recipeId && e.planSlotRef === slot.planSlotRef,
    );
    return i >= 0 ? i : null;
  }
  const ordinal = slotOrdinalAmongSameRecipe(meals, chipIdx, recipeId);
  let seen = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i].id === recipeId) {
      seen++;
      if (seen === ordinal) {
        return i;
      }
    }
  }
  return null;
}

/** Location of this unassigned chip’s cook log in the visible week. */
export function findUnassignedSlotHistoryLocation(
  history: CookHistoryByDate,
  weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  chipIdx: number,
  recipeId: string,
): { dateIso: string; index: number } | null {
  const m = unassignedMeals[chipIdx];
  if (!m || m.id !== recipeId) {
    return null;
  }

  if (m.planSlotRef) {
    const dates = Object.keys(history).sort((a, b) => a.localeCompare(b));
    for (const k of dates) {
      const row = history[k] ?? [];
      const i = row.findIndex(
        (e) => e.id === recipeId && e.planSlotRef === m.planSlotRef,
      );
      if (i >= 0) {
        return { dateIso: k, index: i };
      }
    }
    const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, chipIdx, recipeId);
    let seen = 0;
    for (const k of weekKeys) {
      const row = history[k] ?? [];
      for (let i = 0; i < row.length; i++) {
        const e = row[i];
        if (e.id !== recipeId || e.planSlotRef !== undefined) {
          continue;
        }
        seen++;
        if (seen === ordinal) {
          return { dateIso: k, index: i };
        }
      }
    }
    return null;
  }

  const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, chipIdx, recipeId);
  let seen = 0;
  for (const k of weekKeys) {
    const row = history[k] ?? [];
    for (let i = 0; i < row.length; i++) {
      if (row[i].id === recipeId) {
        seen++;
        if (seen === ordinal) {
          return { dateIso: k, index: i };
        }
      }
    }
  }
  return null;
}
