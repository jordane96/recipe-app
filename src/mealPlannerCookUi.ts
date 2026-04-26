import type { CookHistoryByDate } from "./cookHistoryStorage";
import { isIsoDateInLocalRollingLastNDays } from "./mealPlanDates";
import { isMealPlanDateKey, type PlannedMeal } from "./mealPlanStorage";

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

/** Cook status for an unassigned slot using the full cook log (not the planner’s visible week). */
export function isUnassignedSlotCookedAllTime(
  history: CookHistoryByDate,
  unassignedMeals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  return isUnassignedSlotCooked(
    history,
    sortedHistoryDateKeys(history),
    unassignedMeals,
    idx,
    recipeId,
  );
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

export function sortedHistoryDateKeys(history: CookHistoryByDate): string[] {
  return Object.keys(history).sort((a, b) => a.localeCompare(b));
}

/**
 * Calendar day that “pins” a cooked unassigned chip to a week for planner navigation
 * (scheduled day if set, otherwise the cook-log date).
 */
export function cookedUnassignedAnchorDateIso(
  history: CookHistoryByDate,
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): string | null {
  const m = unassignedMeals[planIdx];
  if (!m) {
    return null;
  }
  if (m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay)) {
    return m.scheduledForDay;
  }
  if (m.planSlotRef) {
    for (const k of sortedHistoryDateKeys(history)) {
      const row = history[k] ?? [];
      if (row.some((e) => e.id === m.id && e.planSlotRef === m.planSlotRef)) {
        return k;
      }
    }
    const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, planIdx, m.id);
    let seen = 0;
    for (const k of sortedHistoryDateKeys(history)) {
      for (const e of history[k] ?? []) {
        if (e.id !== m.id || e.planSlotRef !== undefined) {
          continue;
        }
        seen++;
        if (seen === ordinal) {
          return k;
        }
      }
    }
    return null;
  }

  const ordinal = slotOrdinalAmongSameRecipe(unassignedMeals, planIdx, m.id);
  let seen = 0;
  for (const k of sortedHistoryDateKeys(history)) {
    for (const e of history[k] ?? []) {
      if (e.id !== m.id) {
        continue;
      }
      seen++;
      if (seen === ordinal) {
        return k;
      }
    }
  }
  return null;
}

/**
 * Whether this unassigned row should appear in the planner unassigned card (This week’s
 * menu or Cooked recently). Cooked rows appear in “Cooked recently” when their anchor
 * date (scheduled day or cook log) is in the last 7 local calendar days; older cooked
 * rows are hidden. `weekKeys` is kept for call-site compatibility.
 */
export function unassignedSlotShownInPlannerWeek(
  history: CookHistoryByDate,
  weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): boolean {
  void weekKeys;
  const m = unassignedMeals[planIdx];
  if (!m) {
    return false;
  }
  if (!isUnassignedSlotCookedAllTime(history, unassignedMeals, planIdx, m.id)) {
    return true;
  }
  const anchor = cookedUnassignedAnchorDateIso(history, unassignedMeals, planIdx);
  if (!anchor) {
    return true;
  }
  return isIsoDateInLocalRollingLastNDays(anchor, 7);
}
