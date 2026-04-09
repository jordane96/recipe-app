/** Persist the recipe list "Sides" tab via `?tab=side` so Back returns to Sides. */

export const LIST_TAB_QUERY = "tab";
export const LIST_TAB_SIDE_VALUE = "side";

export function readSidesListTab(searchParams: URLSearchParams): boolean {
  return searchParams.get(LIST_TAB_QUERY) === LIST_TAB_SIDE_VALUE;
}

export function homeListPath(sidesTab: boolean): string {
  return sidesTab ? `/recipes?${LIST_TAB_QUERY}=${LIST_TAB_SIDE_VALUE}` : "/recipes";
}

export function recipeDetailPath(recipeId: string, sidesTab: boolean): string {
  const q = sidesTab ? `?${LIST_TAB_QUERY}=${LIST_TAB_SIDE_VALUE}` : "";
  return `/recipe/${recipeId}${q}`;
}

export function shoppingListPath(sidesTab: boolean): string {
  return sidesTab
    ? `/shopping?${LIST_TAB_QUERY}=${LIST_TAB_SIDE_VALUE}`
    : "/shopping";
}
