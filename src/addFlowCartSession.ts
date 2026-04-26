import {
  ADD_TO_PLAN_QUERY,
  COOK_ON_ADD_QUERY,
  COOK_ON_ADD_VALUE,
  PLAN_PHASE_QUERY,
  PLAN_WEEK_START_QUERY,
  readShopMenuBuild,
  urlParamToPlanKey,
} from "./listTabSearch";

const ADD_FLOW_CART_V1 = "recipeAddFlowCartV1:";

const ACTIVE_ADD_FLOW_META_KEY = "recipeAddFlowActiveKeyMetaV1";

/**
 * Key for the recipe-list "cart" in sessionStorage (same shape as the URL add-to-plan context).
 * Exported for use with `useSearchParams` on the recipe list and detail.
 */
export function addFlowCartSessionKey(sp: URLSearchParams): string | null {
  const atp = sp.get(ADD_TO_PLAN_QUERY);
  if (!atp || !urlParamToPlanKey(atp)) {
    return null;
  }
  const w = sp.get(PLAN_WEEK_START_QUERY) ?? "";
  const ph = sp.get(PLAN_PHASE_QUERY) ?? "";
  const cook = sp.get(COOK_ON_ADD_QUERY) === COOK_ON_ADD_VALUE ? "1" : "0";
  const shop = readShopMenuBuild(sp) ? "1" : "0";
  return `${ADD_FLOW_CART_V1}${atp}:${w}:${ph}:${cook}:${shop}`;
}

/**
 * `Routes` with a valid `addToPlan` in the search string where the cart builder applies
 * (recipe list or non–cook-mode recipe / edit, not the meal planner home).
 */
export function isAddFlowBuilderLocation(pathname: string, search: string): boolean {
  const sp = new URLSearchParams(search);
  if (urlParamToPlanKey(sp.get(ADD_TO_PLAN_QUERY)) == null) {
    return false;
  }
  if (pathname === "/recipes") {
    return true;
  }
  if (
    /^\/recipe\/[^/]+\/edit$/.test(pathname) ||
    /^\/recipe\/[^/]+$/.test(pathname)
  ) {
    return true;
  }
  return false;
}

/** Mark which sessionStorage key is the active cart (for clearing when navigating away). */
export function setActiveAddFlowSessionKey(key: string | null): void {
  try {
    if (key) {
      sessionStorage.setItem(ACTIVE_ADD_FLOW_META_KEY, key);
    } else {
      sessionStorage.removeItem(ACTIVE_ADD_FLOW_META_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Remove the active cart’s JSON entry and the meta pointer. Safe to call if already empty.
 * Used when the user leaves the builder (or on startup if the previous session leaked).
 */
export function clearActiveAddFlowSessionStorage(): void {
  try {
    const k = sessionStorage.getItem(ACTIVE_ADD_FLOW_META_KEY);
    if (k) {
      sessionStorage.removeItem(k);
    }
    sessionStorage.removeItem(ACTIVE_ADD_FLOW_META_KEY);
  } catch {
    // ignore
  }
}
