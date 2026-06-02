/**
 * Tiny global record of the previous + current SPA pathname.
 *
 * Updated from AppLayout's render (via useMemo keyed on pathname) so the value is correct *before*
 * child route components run their own mount effects. (React fires child effects before the
 * parent's, so a prev-pathname tracked in the parent's effect would be one navigation stale when a
 * freshly-mounted child reads it.)
 *
 * Used to tell "returned to the recipe list from a recipe detail" (restore the list's scroll
 * position) apart from "arrived at the list fresh from another tab" (snap to top). The in-app
 * "Back" button is a <Link> — i.e. a PUSH navigation, not a browser POP — so navigationType alone
 * can't distinguish these.
 */
let previousPathname: string | null = null;
let currentPathname: string | null = null;

export function recordNavigation(pathname: string): void {
  if (pathname === currentPathname) {
    return;
  }
  previousPathname = currentPathname;
  currentPathname = pathname;
}

export function getPreviousPathname(): string | null {
  return previousPathname;
}

/** True for a recipe *detail* path (`/recipe/:id`), not the list (`/recipes`) or edit sub-route. */
export function isRecipeDetailPathname(pathname: string | null): boolean {
  return pathname != null && /^\/recipe\/[^/]+$/.test(pathname);
}
