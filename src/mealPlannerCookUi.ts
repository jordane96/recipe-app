import type { CookHistoryByDate } from "./cookHistoryStorage";
import { isIsoDateInLocalRollingLastNDays } from "./mealPlanDates";
import { type PlannedMeal } from "./mealPlanStorage";

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

/** True if there is a cook-log entry whose planSlotRef matches the given slot ref. */
function isSlotRefCookedAnywhere(history: CookHistoryByDate, slotRef: string): boolean {
  for (const entries of Object.values(history)) {
    if (entries?.some((e) => e.planSlotRef === slotRef)) return true;
  }
  return false;
}

/** Most recent date this exact slot was cooked, or null. */
function mostRecentCookDateBySlotRef(
  history: CookHistoryByDate,
  slotRef: string,
): string | null {
  const keys = sortedHistoryDateKeys(history).reverse();
  for (const k of keys) {
    if ((history[k] ?? []).some((e) => e.planSlotRef === slotRef)) return k;
  }
  return null;
}

/**
 * Pool slot cooked = THIS slot (by planSlotRef) has a cook log entry. Slots without a ref
 * fall back to recipe-id match for backward compatibility with legacy plans.
 */
export function isUnassignedSlotCookedAllTime(
  history: CookHistoryByDate,
  unassignedMeals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  const slot = unassignedMeals[idx];
  if (slot?.planSlotRef) {
    return isSlotRefCookedAnywhere(history, slot.planSlotRef);
  }
  return isRecipeCookedAllTime(history, recipeId);
}

/**
 * Show in planner unless THIS slot was cooked all-time but not in the last 7 days.
 * Slot-ref-aware so re-adding a previously-cooked recipe creates a slot that is always shown
 * (the new slot has no cook entries, regardless of the recipe's id-level history).
 */
export function unassignedSlotShownInPlannerWeek(
  history: CookHistoryByDate,
  _weekKeys: string[],
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): boolean {
  const m = unassignedMeals[planIdx];
  if (!m) return false;
  if (m.planSlotRef) {
    // New slot-ref world: only filter THIS slot, ignore id-level history of past slots.
    if (!isSlotRefCookedAnywhere(history, m.planSlotRef)) return true;
    const last = mostRecentCookDateBySlotRef(history, m.planSlotRef);
    return last != null && isIsoDateInLocalRollingLastNDays(last, 7);
  }
  // Legacy slot (no ref) falls back to id-based matching.
  if (!isRecipeCookedAllTime(history, m.id)) return true;
  return isRecipeCookedRecently(history, m.id, 7);
}

/** Date the cooked pool chip anchors to (for display) — most recent cook for this recipe. */
export function cookedUnassignedAnchorDateIso(
  history: CookHistoryByDate,
  unassignedMeals: PlannedMeal[],
  planIdx: number,
): string | null {
  const m = unassignedMeals[planIdx];
  if (!m) return null;
  return mostRecentCookDate(history, m.id);
}

/** Location of this pool chip's most recent cook log entry (slot-ref preferred, id fallback). */
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
    let i = -1;
    if (m.planSlotRef) {
      i = row.findIndex((e) => e.planSlotRef === m.planSlotRef);
    }
    if (i < 0) {
      i = row.findIndex((e) => e.planSlotRef == null && e.id === recipeId);
    }
    if (i >= 0) return { dateIso: k, index: i };
  }
  return null;
}

/** True if a calendar-day slot has a cook log entry on that date (slot-ref-aware). */
export function isDaySlotCooked(
  history: CookHistoryByDate,
  dateKey: string,
  meals: PlannedMeal[],
  idx: number,
  recipeId: string,
): boolean {
  const slot = meals[idx];
  if (!slot || slot.id !== recipeId) return false;
  const row = history[dateKey] ?? [];
  if (slot.planSlotRef && row.some((e) => e.planSlotRef === slot.planSlotRef)) return true;
  // Legacy fallback: when slot has no ref, accept any same-id cook entry without a ref.
  if (!slot.planSlotRef && row.some((e) => e.planSlotRef == null && e.id === recipeId)) return true;
  return false;
}

/** Index in `history[dateIso]` for a calendar-day chip's cook log (slot-ref-aware). */
export function findDaySlotHistoryIndex(
  history: CookHistoryByDate,
  dateIso: string,
  meals: PlannedMeal[],
  chipIdx: number,
  recipeId: string,
): number | null {
  const slot = meals[chipIdx];
  if (!slot || slot.id !== recipeId) return null;
  const row = history[dateIso] ?? [];
  let i = -1;
  if (slot.planSlotRef) {
    i = row.findIndex((e) => e.planSlotRef === slot.planSlotRef);
  }
  if (i < 0) {
    i = row.findIndex((e) => e.planSlotRef == null && e.id === recipeId);
  }
  return i >= 0 ? i : null;
}

export function historyCountForRecipeOnDay(
  history: CookHistoryByDate,
  dateKey: string,
  recipeId: string,
): number {
  return (history[dateKey] ?? []).filter((x) => x.id === recipeId).length;
}
