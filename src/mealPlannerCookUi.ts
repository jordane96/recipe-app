import type { CookHistoryByDate } from "./cookHistoryStorage";
import { isIsoDateInLocalRollingLastNDays } from "./mealPlanDates";
import { isMealPlanDateKey, type PlannedMeal } from "./mealPlanStorage";

export function sortedHistoryDateKeys(history: CookHistoryByDate): string[] {
  return Object.keys(history).sort((a, b) => a.localeCompare(b));
}

/** True if this recipe appears in any cook log entry. */
export function isRecipeCookedAllTime(
  history: CookHistoryByDate,
  recipeId: string,
): boolean {
  return Object.values(history).some((entries) =>
    entries?.some((e) => e.id === recipeId),
  );
}

/** True if this recipe was cooked within the last `days` calendar days. */
export function isRecipeCookedRecently(
  history: CookHistoryByDate,
  recipeId: string,
  days: number,
): boolean {
  for (const [dateKey, entries] of Object.entries(history)) {
    if (!isIsoDateInLocalRollingLastNDays(dateKey, days)) continue;
    if (entries?.some((e) => e.id === recipeId)) return true;
  }
  return false;
}

/** Most recent date this recipe was cooked, or null. */
export function mostRecentCookDate(
  history: CookHistoryByDate,
  recipeId: string,
): string | null {
  const keys = sortedHistoryDateKeys(history).reverse();
  for (const k of keys) {
    if ((history[k] ?? []).some((e) => e.id === recipeId)) return k;
  }
  return null;
}

/** Pool slot cooked = recipe cooked at any time. */
export function isUnassignedSlotCookedAllTime(
  history: CookHistoryByDate,
  _unassignedMeals: PlannedMeal[],
  _idx: number,
  recipeId: string,
): boolean {
  return isRecipeCookedAllTime(history, recipeId);
}

/** Show in planner if uncooked, or cooked within last 7 days. */
export function unassignedSlotShownInPlannerWeek(
  history: CookHistoryByDate,
  _weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): boolean {
  const m = unassignedMeals[planIdx];
  if (!m) return false;
  if (!isRecipeCookedAllTime(history, m.id)) return true;
  return isRecipeCookedRecently(history, m.id, 7);
}

/** Date the cooked pool chip anchors to (for display). */
export function cookedUnassignedAnchorDateIso(
  history: CookHistoryByDate,
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): string | null {
  const m = unassignedMeals[planIdx];
  if (!m) return null;
  if (m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay)) {
    return m.scheduledForDay;
  }
  return mostRecentCookDate(history, m.id);
}

/** Location of this pool chip's most recent cook log entry. */
export function findUnassignedSlotHistoryLocation(
  history: CookHistoryByDate,
  _weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  chipIdx: number,
  recipeId: string,
): { dateIso: string; index: number } | null {
  const m = unassignedMeals[chipIdx];
  if (!m || m.id !== recipeId) return null;
  for (const k of sortedHistoryDateKeys(history).reverse()) {
    const row = history[k] ?? [];
    const i = row.findIndex((e) => e.id === recipeId);
    if (i >= 0) return { dateIso: k, index: i };
  }
  return null;
}

/** True if a calendar-day slot has a cook log entry on that date. */
export function isDaySlotCooked(
  history: CookHistoryByDate,
  dateKey: string,
  meals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  const slot = meals[idx];
  if (!slot || slot.id !== recipeId) return false;
  return (history[dateKey] ?? []).some((e) => e.id === recipeId);
}

/** Index in `history[dateIso]` for a calendar-day chip's cook log. */
export function findDaySlotHistoryIndex(
  history: CookHistoryByDate,
  dateIso: string,
  meals: PlannedMeal[],
  chipIdx: number,
  recipeId: string,
): number | null {
  const slot = meals[chipIdx];
  if (!slot || slot.id !== recipeId) return null;
  const i = (history[dateIso] ?? []).findIndex((e) => e.id === recipeId);
  return i >= 0 ? i : null;
}

export function historyCountForRecipeOnDay(
  history: CookHistoryByDate,
  dateKey: string,
  recipeId: string,
): number {
  return (history[dateKey] ?? []).filter((x) => x.id === recipeId).length;
}
