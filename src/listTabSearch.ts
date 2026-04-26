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

/** After “Add to menu” on the recipe list, start cook mode for the new plan row. */
export const COOK_ON_ADD_QUERY = "cookOnAdd";
export const COOK_ON_ADD_VALUE = "1";

/** One-shot: recipe list merges this id into the add-to-menu cart then drops the param. */
export const ADD_TO_CART_QUERY = "addToCart";

/**
 * “Shop + menu” build from empty shopping list: unassigned + week + from=shopping, then
 * user picks a cart, confirms once to add to plan and shopping.
 */
export const SHOP_MENU_BUILD_QUERY = "shopBuild";
export const SHOP_MENU_BUILD_VALUE = "1";

export function readShopMenuBuild(sp: URLSearchParams): boolean {
  return sp.get(SHOP_MENU_BUILD_QUERY) === SHOP_MENU_BUILD_VALUE;
}

/**
 * “Pick recipes” flows where Back should return to `/recipes` with the same cart
 * context (not `/shopping` or the meal plan), e.g. shop+menu build or cook-now pick.
 */
export function isRecipeListCartBuildFlow(sp: URLSearchParams): boolean {
  const pk = urlParamToPlanKey(sp.get(ADD_TO_PLAN_QUERY));
  if (pk == null || pk !== MEAL_PLAN_UNASSIGNED_KEY) {
    return false;
  }
  if (readShopMenuBuild(sp)) {
    return true;
  }
  if (sp.get(COOK_ON_ADD_QUERY) === COOK_ON_ADD_VALUE) {
    return true;
  }
  return false;
}

/** Drives list + detail "add" labels and `RecipeList` back navigation for pick flows. */
export type RecipeListPickExperience = "shop" | "cook" | "menu" | "none";

/**
 * `shop` = unassigned + `shopBuild=1` (list & shopping list, even if `from=shopping` was dropped).  
 * `cook` = unassigned + `cookOnAdd=1` (cook-now pick).  
 * `menu` = a dated `addToPlan` or unassigned add-to-menu without shop/cook.  
 * `none` = no `addToPlan` in URL.
 */
export function readRecipeListPickExperience(sp: URLSearchParams): RecipeListPickExperience {
  const pk = urlParamToPlanKey(sp.get(ADD_TO_PLAN_QUERY));
  if (pk == null) {
    return "none";
  }
  if (pk === MEAL_PLAN_UNASSIGNED_KEY) {
    if (readShopMenuBuild(sp)) {
      return "shop";
    }
    if (sp.get(COOK_ON_ADD_QUERY) === COOK_ON_ADD_VALUE) {
      return "cook";
    }
    return "menu";
  }
  return "menu";
}

export function recipeDetailAddCtaLabel(sp: URLSearchParams): string {
  const ex = readRecipeListPickExperience(sp);
  if (ex === "none") {
    return "Add to menu";
  }
  if (ex === "shop") {
    return "Add to shopping list";
  }
  if (ex === "cook") {
    return "Cook now";
  }
  return "Add to menu";
}

/**
 * `from=shopping` on recipe detail: Back goes to `/shopping` unless
 * `isRecipeListCartBuildFlow` (shop+menu or cook-now pick), then Back goes to `/recipes` with the same cart query.
 */
export const FROM_QUERY = "from";
export const FROM_SHOPPING_VALUE = "shopping";
/** Recipe opened from Calendar — Back returns to `/history`. */
export const FROM_HISTORY_VALUE = "history";
/** “View recipe” from cook mode — Back returns to cook mode for the same session. */
export const FROM_COOK_MODE_VALUE = "cook";
/** “View” from meal planner (home) — Back returns to `/` (this week’s menu). */
export const FROM_PLANNER_VALUE = "planner";
/** Cook anchor when opening the recipe from the planner (scheduled day or today). */
export const PLANNER_ANCHOR_DATE_QUERY = "plannerDate";
export const PLANNER_PLAN_SLOT_REF_QUERY = "plannerSlot";

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

/** Drop cook-mode query params; keep plan / from / tab context for links back to recipe detail. */
export function stripCookModeParams(searchParams: URLSearchParams): URLSearchParams {
  const q = new URLSearchParams(searchParams);
  q.delete(COOK_MODE_QUERY);
  q.delete(COOK_DATE_QUERY);
  q.delete(COOK_SLOT_REF_QUERY);
  return q;
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

export function readFromCookMode(searchParams: URLSearchParams): boolean {
  return searchParams.get(FROM_QUERY) === FROM_COOK_MODE_VALUE;
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

function copyFromPlannerParam(from: URLSearchParams, to: URLSearchParams): void {
  if (from.get(FROM_QUERY) !== FROM_PLANNER_VALUE) {
    return;
  }
  to.set(FROM_QUERY, FROM_PLANNER_VALUE);
  const pd = from.get(PLANNER_ANCHOR_DATE_QUERY);
  if (pd && isMealPlanDateKey(pd)) {
    to.set(PLANNER_ANCHOR_DATE_QUERY, pd);
  }
  const ps = from.get(PLANNER_PLAN_SLOT_REF_QUERY);
  if (ps && ps.length > 0) {
    to.set(PLANNER_PLAN_SLOT_REF_QUERY, ps);
  }
}

export function readFromPlanner(searchParams: URLSearchParams): boolean {
  return searchParams.get(FROM_QUERY) === FROM_PLANNER_VALUE;
}

export function readPlannerMenuCookContext(searchParams: URLSearchParams): {
  dateIso: string;
  planSlotRef: string | null;
} | null {
  if (searchParams.get(FROM_QUERY) !== FROM_PLANNER_VALUE) {
    return null;
  }
  const d = searchParams.get(PLANNER_ANCHOR_DATE_QUERY);
  if (!d || !isMealPlanDateKey(d)) {
    return null;
  }
  const ref = searchParams.get(PLANNER_PLAN_SLOT_REF_QUERY);
  return { dateIso: d, planSlotRef: ref && ref.length > 0 ? ref : null };
}

/** Open full recipe from the meal planner home — detail shows “Cook now” + “Back” (to `/`). */
export function recipeDetailFromMenuPath(
  recipeId: string,
  anchor: { dateIso: string; planSlotRef: string | null },
): string {
  const q = new URLSearchParams();
  q.set(FROM_QUERY, FROM_PLANNER_VALUE);
  q.set(PLANNER_ANCHOR_DATE_QUERY, anchor.dateIso);
  if (anchor.planSlotRef) {
    q.set(PLANNER_PLAN_SLOT_REF_QUERY, anchor.planSlotRef);
  }
  return `/recipe/${recipeId}?${q.toString()}`;
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

/**
 * “Add meal” from the empty Cooking now screen — unassigned pool for this week, then
 * open cook mode once the user picks a recipe.
 */
export function recipesAddMealForCookingPath(weekStartIso: string): string {
  const q = new URLSearchParams();
  q.set(ADD_TO_PLAN_QUERY, planKeyToUrlParam(MEAL_PLAN_UNASSIGNED_KEY));
  if (isMealPlanDateKey(weekStartIso)) {
    q.set(PLAN_WEEK_START_QUERY, weekStartIso);
  }
  q.set(PLAN_PHASE_QUERY, PLAN_PHASE_MAIN);
  q.set(COOK_ON_ADD_QUERY, COOK_ON_ADD_VALUE);
  return `/recipes?${q.toString()}`;
}

/**
 * Empty shopping list: browse and pick recipes, then one confirmation adds to menu and list.
 * Preserves `from=shopping` for Back to `/shopping` and for recipe-detail links.
 */
export function recipesShopMenuBuildPath(weekStartIso: string): string {
  const q = new URLSearchParams();
  q.set(ADD_TO_PLAN_QUERY, planKeyToUrlParam(MEAL_PLAN_UNASSIGNED_KEY));
  if (isMealPlanDateKey(weekStartIso)) {
    q.set(PLAN_WEEK_START_QUERY, weekStartIso);
  }
  q.set(PLAN_PHASE_QUERY, PLAN_PHASE_MAIN);
  q.set(SHOP_MENU_BUILD_QUERY, SHOP_MENU_BUILD_VALUE);
  q.set(FROM_QUERY, FROM_SHOPPING_VALUE);
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

/** addToPlan + plan phase + week + cook-on-add + shop-build (full recipe list context). */
function copyAddToPlanFlowParamsForList(from: URLSearchParams, to: URLSearchParams): void {
  copyAddToPlanParams(from, to);
  if (from.get(COOK_ON_ADD_QUERY) === COOK_ON_ADD_VALUE) {
    to.set(COOK_ON_ADD_QUERY, COOK_ON_ADD_VALUE);
  }
  if (from.get(SHOP_MENU_BUILD_QUERY) === SHOP_MENU_BUILD_VALUE) {
    to.set(SHOP_MENU_BUILD_QUERY, SHOP_MENU_BUILD_VALUE);
  }
}

/**
 * Return to the pick flow with a one-shot “add this recipe id to the cart” instruction.
 * Used from recipe detail when addToPlan=… is in the URL.
 */
export function recipesListAddToCartPath(
  preserveParams: URLSearchParams,
  recipeId: string,
): string {
  const q = new URLSearchParams();
  copyAddToPlanFlowParamsForList(preserveParams, q);
  if (!q.has(ADD_TO_PLAN_QUERY)) {
    return "/recipes";
  }
  q.set(ADD_TO_CART_QUERY, recipeId);
  return `/recipes?${q.toString()}`;
}

export function homeListPath(
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
): string {
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      const q = new URLSearchParams();
      copyAddToPlanFlowParamsForList(preserveParams, q);
      return `/recipes?${q.toString()}`;
    }
  }
  return sidesTab ? `/recipes?${LIST_TAB_QUERY}=${LIST_TAB_SIDE_VALUE}` : "/recipes";
}

/** Back from recipe detail: cook mode vs calendar vs shopping list vs recipe list (and plan-preserved URLs). */
export function recipeDetailBackPath(
  recipeId: string,
  sidesTab: boolean,
  preserveParams: URLSearchParams | undefined,
  fromShopping: boolean,
  fromHistory: boolean,
  searchParams: URLSearchParams,
): string {
  if (readFromCookMode(searchParams)) {
    const d = searchParams.get(COOK_DATE_QUERY);
    const ref = searchParams.get(COOK_SLOT_REF_QUERY);
    if (d && isMealPlanDateKey(d)) {
      return recipeCookModePath(
        recipeId,
        d,
        ref && ref.length > 0 ? ref : null,
      );
    }
  }
  if (readFromPlanner(searchParams)) {
    return "/";
  }
  if (fromHistory) {
    return "/history";
  }
  if (fromShopping) {
    if (isRecipeListCartBuildFlow(searchParams)) {
      return homeListPath(sidesTab, preserveParams ?? searchParams);
    }
    return shoppingListPath(sidesTab, preserveParams);
  }
  return homeListPath(sidesTab, preserveParams);
}

/** When set, user opened full recipe from cook mode; `cook=1` is not set, so this is not active cook mode. */
export type RecipeDetailCookViewContext = { cookDate: string; cookSlotRef: string | null };

export function recipeDetailPath(
  recipeId: string,
  sidesTab: boolean,
  preserveParams?: URLSearchParams,
  fromShopping?: boolean,
  fromHistory?: boolean,
  cookViewFromSession?: RecipeDetailCookViewContext,
): string {
  const q = new URLSearchParams();
  if (preserveParams) {
    const atp = preserveParams.get(ADD_TO_PLAN_QUERY);
    if (atp && urlParamToPlanKey(atp)) {
      copyAddToPlanFlowParamsForList(preserveParams, q);
    }
    copyFromShoppingParam(preserveParams, q);
    copyFromHistoryParam(preserveParams, q);
    copyFromPlannerParam(preserveParams, q);
  }
  if (cookViewFromSession) {
    q.set(FROM_QUERY, FROM_COOK_MODE_VALUE);
    q.set(COOK_DATE_QUERY, cookViewFromSession.cookDate);
    if (cookViewFromSession.cookSlotRef) {
      q.set(COOK_SLOT_REF_QUERY, cookViewFromSession.cookSlotRef);
    } else {
      q.delete(COOK_SLOT_REF_QUERY);
    }
  } else {
    if (fromShopping) {
      q.set(FROM_QUERY, FROM_SHOPPING_VALUE);
    }
    if (fromHistory) {
      q.set(FROM_QUERY, FROM_HISTORY_VALUE);
    }
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
      copyAddToPlanFlowParamsForList(preserveParams, q);
    }
    copyFromShoppingParam(preserveParams, q);
    copyFromHistoryParam(preserveParams, q);
    copyFromPlannerParam(preserveParams, q);
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
      copyAddToPlanFlowParamsForList(preserveParams, q);
    }
  }
  if (!q.has(ADD_TO_PLAN_QUERY) && sidesTab) {
    q.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
  }
  const s = q.toString();
  return s ? `/shopping?${s}` : "/shopping";
}
