import { isMealPlanDateKey } from "./mealPlanStorage";

const COOK_HISTORY_KEY = "recipe-app-cook-history-v1";

/** One logged cook event (same shape as planned meals). */
export type CookedMeal = {
  id: string;
  title: string;
  kind: "main" | "side";
  /** Matches {@link PlannedMeal.planSlotRef} so duplicate recipes stay independent. */
  planSlotRef?: string;
};

export type CookHistoryByDate = Record<string, CookedMeal[]>;

function parseStored(raw: Record<string, unknown>): CookHistoryByDate {
  const out: CookHistoryByDate = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isMealPlanDateKey(k) || !Array.isArray(v)) {
      continue;
    }
    const arr = v.filter(
      (x): x is CookedMeal =>
        x != null &&
        typeof x === "object" &&
        typeof (x as CookedMeal).id === "string" &&
        typeof (x as CookedMeal).title === "string" &&
        ((x as CookedMeal).kind === "main" || (x as CookedMeal).kind === "side") &&
        ((x as CookedMeal).planSlotRef === undefined ||
          typeof (x as CookedMeal).planSlotRef === "string"),
    );
    if (arr.length) {
      out[k] = arr;
    }
  }
  return out;
}

export function loadCookHistory(): CookHistoryByDate {
  try {
    const s = localStorage.getItem(COOK_HISTORY_KEY);
    if (!s) {
      return {};
    }
    const o = JSON.parse(s) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) {
      return {};
    }
    return parseStored(o as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function saveCookHistory(history: CookHistoryByDate) {
  localStorage.setItem(COOK_HISTORY_KEY, JSON.stringify(history));
}
