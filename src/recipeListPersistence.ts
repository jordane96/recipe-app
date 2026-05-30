/**
 * Session-scoped persistence for RecipeList filter chips, search query, and scroll position.
 *
 * Why sessionStorage: the goal is "list ↔ detail" continuity, not multi-session memory.
 * Clears on tab close / sign-out (in line with the rest of the app's cook-session state).
 *
 * Scroll restoration is triggered by the caller only on POP navigation (back nav), so
 * forward nav to /recipes (e.g. tapping "Recipes" in the nav bar) still snaps to top
 * per App.tsx's universal snap-to-top behavior.
 */

const FILTERS_KEY = "recipe-app-list-filters-v1";
const SCROLL_KEY = "recipe-app-list-scroll-v1";

export type RecipeListFilters = {
  q: string;
  selectedTags: string[];
  filtersOpen: boolean;
};

const EMPTY: RecipeListFilters = { q: "", selectedTags: [], filtersOpen: false };

export function loadRecipeListFilters(): RecipeListFilters {
  try {
    const s = sessionStorage.getItem(FILTERS_KEY);
    if (!s) return EMPTY;
    const o = JSON.parse(s) as unknown;
    if (o == null || typeof o !== "object") return EMPTY;
    const rec = o as Record<string, unknown>;
    const q = typeof rec.q === "string" ? rec.q : "";
    const tags = Array.isArray(rec.selectedTags)
      ? rec.selectedTags.filter((t): t is string => typeof t === "string")
      : [];
    const filtersOpen = typeof rec.filtersOpen === "boolean" ? rec.filtersOpen : false;
    return { q, selectedTags: tags, filtersOpen };
  } catch {
    return EMPTY;
  }
}

export function saveRecipeListFilters(filters: RecipeListFilters): void {
  try {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function loadRecipeListScrollY(): number | null {
  try {
    const s = sessionStorage.getItem(SCROLL_KEY);
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function saveRecipeListScrollY(y: number): void {
  try {
    sessionStorage.setItem(SCROLL_KEY, String(Math.max(0, Math.round(y))));
  } catch {
    // ignore
  }
}
