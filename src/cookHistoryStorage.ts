import { isMealPlanDateKey } from "./mealPlanStorage";

const COOK_HISTORY_KEY = "recipe-app-cook-history-v2";

export type CookedMeal = {
  id: string;
  title: string;
  kind: "main" | "side";
};

export type CookHistoryByDate = Record<string, CookedMeal[]>;

function parseStored(raw: Record<string, unknown>): CookHistoryByDate {
  const out: CookHistoryByDate = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!isMealPlanDateKey(k) || !Array.isArray(v)) continue;
    const arr: CookedMeal[] = [];
    for (const x of v) {
      if (
        x != null &&
        typeof x === "object" &&
        typeof (x as CookedMeal).id === "string" &&
        typeof (x as CookedMeal).title === "string" &&
        ((x as CookedMeal).kind === "main" || (x as CookedMeal).kind === "side")
      ) {
        arr.push({ id: (x as CookedMeal).id, title: (x as CookedMeal).title, kind: (x as CookedMeal).kind });
      }
    }
    if (arr.length) out[k] = arr;
  }
  return out;
}

export function loadCookHistory(): CookHistoryByDate {
  try {
    const s = localStorage.getItem(COOK_HISTORY_KEY);
    if (!s) return {};
    const o = JSON.parse(s) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) return {};
    return parseStored(o as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function saveCookHistory(history: CookHistoryByDate) {
  localStorage.setItem(COOK_HISTORY_KEY, JSON.stringify(history));
}
