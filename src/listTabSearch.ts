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

/** Monday of the visible planner week (YYYY-MM-DD), only with `addToPlan=unassigned`. */
export const PLAN_WEEK_START_QUERY = "weekStart";

/** Recipe opened from shopping list — Back returns to `/shopping`. */
export const FROM_QUERY = "from";
export const FROM_SHOPPING_VALUE = "shopping";
/** Recipe opened from Calendar — Back returns to `/history`. */
export const FROM_HISTORY_VALUE = "history";

/** Cook mode on recipe detail: checklist + log cooked / exit. */
export const COOK_MODE_QUERY = "cook";
export const COOK_DATE_QUERY = "cookDate";
export const COOK_SLOT_REF_QUERY = "slotRef";

/** Navigate from planner “Cook now” — `dateIso` must be a valid plan date key. */
export function recipeCookModePath(
  recipeId: string,
  dateIso: string,
  planSlotRef?: string | null,
): string {
  const q = new URLSearchParams();
  q.set(COOK_MODE_QUERY, "1");
  q.set(COOK_DATE_QUERY, dateIso);
  if (planSlotRef) {
    q.set(COOK_SLOT_REF_QUERY, planSlotRef);
  }
  return `/recipe/${recipeId}?${q.toString()}`;
}

export function readCookModeParams(searchParams: URLSearchParams): {
  cookMode: boolean;
  cookDate: string | null;
  cookSlotRef: string | null;
} {
  const wantsCook = searchParams.get(COOK_MODE_QUERY) === "1";
  const rawDate = searchParams.get(COOK_DATE_QUERY);
  const cookDate = rawDate && isMealPlanDateKey(rawDate) ? rawDate : null;
  const ref = searchParams.get(COOK_SLOT_REF_QUERY);
  const cookSlotRef = ref && ref.length > 0 ? ref : null;
  return {
    cookMode: wantsCook && cookDate != null,
    cookDate: wantsCook ? cookDate : null,
    cookSlotRef,
  };
}

export function readFromShopping(searchParams: URLSearchParams): boolean {
  return searchParams.get(FROM_QUERY) === FROM_SHOPPING_VALUE;
}

export function readFromHistory(searchParams: URLSearchParams): boolean {
  return searchParams.get(FROM_QUERY) === FROM_HISTORY_VALUE;
}

function copyFromShoppingParam(from: URLSearchParams, to: URLSearchParams): void {
  if (from.get(FROM_QUERY) === FROM_SHOPPING_VALUE) {
    to.set(FROM_QUERY, FROM_SHOPPING_VALUE);
  }
}

function copyFromHistoryParam(from: URLSearchParams, to: URLSearchParams): void {
  if (from.get(FROM_QUERY) === FROM_HISTORY_VALUE) {
    to.set(FROM_QUERY, FROM_HISTORY_VALUE);
  }
}

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
export function recipesAddToPlanPath(
  planStorageKey: string,
  plannerWeekStartIso?: string,
): string {
  const q = new URLSearchParams();
  q.set(ADD_TO_PLAN_QUERY, planKeyToUrlParam(planStorageKey));
  if (
    planStorageKey === MEAL_PLAN_UNASSIGNED_KEY &&
    plannerWeekStartIso &&
    isMealPlanDateKey(plannerWeekStartIso)
  ) {
    q.set(PLAN_WEEK_START_QUERY, plannerWeekStartIso);
  }
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
  const ws = from.get(PLAN_WEEK_START_QUERY);
  if (ws && isMealPlanDateKey(ws)) {
    to.set(PLAN_WEEK_START_QUERY, ws);
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

/** Back from recipe detail: calendar vs shopping list vs recipe list (and plan-preserved URLs). */
export function recipeDetailBackPath(
  sidesTab: boolean,
  preserveParams: URLSearchParams | undefined,
  fromShopping: boolean,
  fromHistory: boolean,
): string {
  if (fromHistory) {
    return "/history";
  }
  if (fromShopping) {
    return shoppingListPath(sidesTab, preserveParams);
  }
  return homeListPath(sidesTab, preserveParams);
}

export function recipeDetailPath(
  recipeId: string,
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
  fromShopping?: boolean,
  fromHistory?: boolean,
): string {
  const q = new URLSearchParams();
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      copyAddToPlanParams(preserveParams, q);
    }
    copyFromShoppingParam(preserveParams, q);
    copyFromHistoryParam(preserveParams, q);
  }
  if (fromShopping) {
    q.set(FROM_QUERY, FROM_SHOPPING_VALUE);
  }
  if (fromHistory) {
    q.set(FROM_QUERY, FROM_HISTORY_VALUE);
  }
  if (!q.has(ADD_TO_PLAN_QUERY) && sidesTab) {
    q.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
  }
  const s = q.toString();
  return `/recipe/${recipeId}${s ? `?${s}` : ""}`;
}

/** Same query preservation as `recipeDetailPath`, for the edit placeholder route. */
export function recipeEditPath(
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
    copyFromShoppingParam(preserveParams, q);
    copyFromHistoryParam(preserveParams, q);
  }
  if (!q.has(ADD_TO_PLAN_QUERY) && sidesTab) {
    q.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
  }
  const s = q.toString();
  return `/recipe/${recipeId}/edit${s ? `?${s}` : ""}`;
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
