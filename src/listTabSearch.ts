/** Persist the recipe list "Sides" tab via `?tab=side` so Back returns to Sides. */

import {
  MEAL_PLAN_UNASSIGNED_KEY,
  isMealPlanDateKey,
} from "./mealPlanStorage";

export const LIST_TAB_QUERY = "tab";
export const LIST_TAB_SIDE_VALUE = "side";

/** Planner-driven add flow: target day (YYYY-MM-DD) or `unassigned` in the URL. */
export const ADD_TO_PLAN_QUERY = "addToPlan";
/** After adding a main, `side` shows Sides tab; omit or `main` for Mains. */
export const PLAN_PHASE_QUERY = "planPhase";
export const PLAN_PHASE_MAIN = "main";
export const PLAN_PHASE_SIDE = "side";
export const ADD_TO_PLAN_URL_UNASSIGNED = "unassigned";

export function readSidesListTab(searchParams: URLSearchParams): boolean {
  return searchParams.get(LIST_TAB_QUERY) === LIST_TAB_SIDE_VALUE;
}

/** True when URL says we're on the optional-side step. */
export function readPlanPhaseSide(searchParams: URLSearchParams): boolean {
  return searchParams.get(PLAN_PHASE_QUERY) === PLAN_PHASE_SIDE;
}

export function urlParamToPlanKey(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value === ADD_TO_PLAN_URL_UNASSIGNED) {
    return MEAL_PLAN_UNASSIGNED_KEY;
  }
  if (isMealPlanDateKey(value)) {
    return value;
  }
  return null;
}

export function planKeyToUrlParam(storageKey: string): string {
  return storageKey === MEAL_PLAN_UNASSIGNED_KEY
    ? ADD_TO_PLAN_URL_UNASSIGNED
    : storageKey;
}

/** `/recipes?addToPlan=…` from a plan storage key (date or unassigned). */
export function recipesAddToPlanPath(planStorageKey: string): string {
  const q = new URLSearchParams();
  q.set(ADD_TO_PLAN_QUERY, planKeyToUrlParam(planStorageKey));
  return `/recipes?${q.toString()}`;
}

function copyAddToPlanParams(from: URLSearchParams, to: URLSearchParams): void {
  const atp = from.get(ADD_TO_PLAN_QUERY);
  if (!atp || !urlParamToPlanKey(atp)) {
    return;
  }
  to.set(ADD_TO_PLAN_QUERY, atp);
  const ph = from.get(PLAN_PHASE_QUERY);
  if (ph === PLAN_PHASE_SIDE || ph === PLAN_PHASE_MAIN) {
    to.set(PLAN_PHASE_QUERY, ph);
  }
}

export function homeListPath(
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
): string {
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      const q = new URLSearchParams();
      copyAddToPlanParams(preserveParams, q);
      return `/recipes?${q.toString()}`;
    }
  }
  return sidesTab ? `/recipes?${LIST_TAB_QUERY}=${LIST_TAB_SIDE_VALUE}` : "/recipes";
}

export function recipeDetailPath(
  recipeId: string,
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
): string {
  const q = new URLSearchParams();
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      copyAddToPlanParams(preserveParams, q);
    }
  }
  if (!q.has(ADD_TO_PLAN_QUERY) && sidesTab) {
    q.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
  }
  const s = q.toString();
  return `/recipe/${recipeId}${s ? `?${s}` : ""}`;
}

export function shoppingListPath(
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
): string {
  const q = new URLSearchParams();
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      copyAddToPlanParams(preserveParams, q);
    }
  }
  if (!q.has(ADD_TO_PLAN_QUERY) && sidesTab) {
    q.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
  }
  const s = q.toString();
  return s ? `/shopping?${s}` : "/shopping";
}
