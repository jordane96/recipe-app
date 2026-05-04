import * as React from "react";
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { applyQualitativeOverrides, loadQualitativeOverrides } from "./qualitativeOverrides";
import { loadRecipeBundle } from "./loadRecipes";
import { MealPlannerPage } from "./MealPlannerPage";
import type { IngredientDef, IngredientsFile, Recipe } from "./types";
import { RecipeDetail } from "./RecipeDetail";
import { AddRecipePlaceholderPage } from "./AddRecipePlaceholderPage";
import { EditRecipePage } from "./EditRecipePage";
import { RecipeList } from "./RecipeList";
import { MealPlanProvider } from "./MealPlanContext";
import { ShoppingListProvider, useShoppingList } from "./ShoppingListContext";
import { ShoppingListPage } from "./ShoppingListPage";
import { CookHistoryProvider } from "./CookHistoryContext";
import { HistoryPage } from "./HistoryPage";
import { ToastProvider } from "./ToastContext";
import { InstacartPlaceholderPage } from "./InstacartPlaceholderPage";
import { CookingNowPage } from "./CookingNowPage";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  getFirstActiveCookSessionHref,
  getCookProgressSessions,
} from "./cookProgressSession";
import {
  EDIT_RECIPE_STEP_QUERY,
  readCookModeParams,
  shoppingListPath,
} from "./listTabSearch";
import {
  clearActiveAddFlowSessionStorage,
  isAddFlowBuilderLocation,
} from "./addFlowCartSession";

function appChromeSectionTitle(pathname: string): string {
  if (pathname === "/" || pathname === "") {
    return "My menu";
  }
  if (pathname === "/recipes") {
    return "Recipes";
  }
  if (pathname === "/recipes/new") {
    return "New recipe";
  }
  if (pathname === "/shopping") {
    return "Shopping list";
  }
  if (pathname === "/history") {
    return "Calendar";
  }
  if (pathname === "/place-order") {
    return "Place order";
  }
  if (pathname.startsWith("/recipe/") && pathname.endsWith("/edit")) {
    return "Edit recipe";
  }
  if (pathname.startsWith("/recipe/")) {
    return "Recipe";
  }
  return "My menu";
}

function appChromeTitle(pathname: string, search: string): string {
  if (pathname === "/cooking-now") {
    return "Cooking now";
  }
  const cook = readCookModeParams(new URLSearchParams(search));
  const recipeDetail = pathname.match(/^\/recipe\/([^/]+)$/);
  if (cook.cookMode && recipeDetail) {
    return "Cooking now";
  }
  return appChromeSectionTitle(pathname);
}

export default function App({ currentUser, onSignOut }: { currentUser: string; onSignOut?: () => void }) {
  const [rawRecipes, setRawRecipes] = React.useState<Recipe[] | null>(null);
  const [ingredientsFile, setIngredientsFile] = React.useState<IngredientsFile | null>(
    null,
  );
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadRecipeBundle()
      .then((bundle) => {
        if (!cancelled) {
          const list = bundle.recipes?.recipes;
          const ing = bundle.ingredients;
          if (!Array.isArray(list)) {
            setErr("Invalid recipes.json (missing recipes array).");
            return;
          }
          if (!ing || !Array.isArray(ing.ingredients)) {
            setErr("Invalid ingredients.json (missing ingredients list).");
            return;
          }
          setRawRecipes(list);
          setIngredientsFile(ing);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not load recipes.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRecipeSaved = React.useCallback((updated: Recipe) => {
    setRawRecipes((prev) => {
      if (!prev) return prev;
      const exists = prev.some((r) => r.id === updated.id);
      return exists ? prev.map((r) => (r.id === updated.id ? updated : r)) : [...prev, updated];
    });
  }, []);

  const recipes = React.useMemo(() => {
    if (!rawRecipes) {
      return null;
    }
    // IDs of recipes the current user has forked — hide the originals from their view
    const forkedOriginIds = new Set(
      rawRecipes
        .filter((r) => r.owner === currentUser && r.forkedFromRecipeId)
        .map((r) => r.forkedFromRecipeId as string),
    );
    const visible = rawRecipes.filter(
      (r) =>
        (r.visibility !== "private" || r.owner === currentUser) &&
        !forkedOriginIds.has(r.id),
    );
    return applyQualitativeOverrides(visible, loadQualitativeOverrides());
  }, [rawRecipes, currentUser]);

  const ingredients = ingredientsFile?.ingredients ?? [];
  const ready = recipes && ingredientsFile;

  return (
    <HashRouter>
      {err ? <p className="err app-shell">{err}</p> : null}
      {!ready && !err ? <p className="muted app-shell">Loading…</p> : null}
      {ready ? (
        <ShoppingListProvider>
          <MealPlanProvider>
            <CookHistoryProvider>
              <ToastProvider>
                <AppLayout
                  recipes={recipes}
                  ingredients={ingredients}
                  ingredientsFile={ingredientsFile}
                  onRecipeSaved={onRecipeSaved}
                  currentUser={currentUser}
                  onSignOut={onSignOut}
                />
              </ToastProvider>
            </CookHistoryProvider>
          </MealPlanProvider>
        </ShoppingListProvider>
      ) : null}
    </HashRouter>
  );
}

function AppLayout({
  recipes,
  ingredients,
  ingredientsFile,
  onRecipeSaved,
  currentUser,
  onSignOut,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  ingredientsFile: IngredientsFile;
  onRecipeSaved: (updated: Recipe) => void;
  currentUser: string;
  onSignOut?: () => void;
}) {
  const { pathname, search } = useLocation();
  const { count } = useShoppingList();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);

  const isPlannerHome = pathname === "/" || pathname === "";
  const wide = isPlannerHome || pathname === "/history" || pathname === "/cooking-now";

  const chromeTitle = React.useMemo(() => appChromeTitle(pathname, search), [pathname, search]);

  const [cookProgressRev, setCookProgressRev] = React.useState(0);
  React.useEffect(() => {
    const on = () => setCookProgressRev((n) => n + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
  }, []);
  const cookNowSessions = React.useMemo(() => getCookProgressSessions(), [cookProgressRev]);
  const cookNowCount = cookNowSessions.length;

  const cookNowHref = React.useMemo(
    () => getFirstActiveCookSessionHref(),
    [cookProgressRev],
  );
  const cookingNowNavTo = cookNowHref ?? "/cooking-now";

  /** Last seen location for scroll-to-top: skip reset when edit page only drops `editStep` (deep-link cleanup). */
  const scrollSnapPrevRef = React.useRef<{ pathname: string; search: string } | null>(null);

  // TEMPORARY scroll debug — remove once mobile snap-to-top is fixed.
  const [scrollDebug, setScrollDebug] = React.useState<string[]>([]);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("debugScroll=1") && !window.location.search.includes("debugScroll=1")) {
      return;
    }
    const log = (label: string) => {
      const y = Math.round(
        window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0,
      );
      const t = Math.round(performance.now());
      setScrollDebug((d) => [...d.slice(-15), `${t}ms ${label}: y=${y}`]);
    };
    log("mount");
    const t1 = window.setTimeout(() => log("100ms"), 100);
    const t2 = window.setTimeout(() => log("500ms"), 500);
    const t3 = window.setTimeout(() => log("1500ms"), 1500);
    const t4 = window.setTimeout(() => log("3000ms"), 3000);
    const onScroll = () => log("scroll-event");
    window.addEventListener("scroll", onScroll, { passive: true });
    const vv = window.visualViewport;
    const onVvResize = () => log("vv-resize");
    if (vv) vv.addEventListener("resize", onVvResize);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.removeEventListener("scroll", onScroll);
      if (vv) vv.removeEventListener("resize", onVvResize);
    };
  }, []);

  const isCookingNowView = React.useMemo(() => {
    if (pathname === "/cooking-now") {
      return true;
    }
    const cook = readCookModeParams(new URLSearchParams(search));
    return Boolean(cook.cookMode && pathname.match(/^\/recipe\/[^/]+$/));
  }, [pathname, search]);

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  /**
   * Snap to top on every in-app navigation (HashRouter does not scroll the window).
   *
   * - `useLayoutEffect` so the scroll fires before the new view paints — prevents the
   *   mobile "flash of old scroll position" on iOS Safari and Android Chrome.
   * - Reset `documentElement.scrollTop` and `body.scrollTop` in addition to `window.scrollTo`
   *   to cover older Safari quirks where one wins over the other.
   * - One-frame follow-up scroll to handle the case where the new page's content paints
   *   slightly after the route commit (URL bar collapse / async data) and drifts back.
   */
  React.useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  React.useLayoutEffect(() => {
    const prev = scrollSnapPrevRef.current;
    scrollSnapPrevRef.current = { pathname, search };

    const snapToTop = () => {
      // Legacy 2-arg form: universally supported on older iOS Safari.
      window.scrollTo(0, 0);
      // Modern object form (some browsers honor only this for `behavior`).
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        // ignore — older browsers may throw on the options form
      }
      if (typeof document !== "undefined") {
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
        if (document.body) {
          document.body.scrollTop = 0;
        }
        // Some routes may have an inner scroll container (e.g. cook mode),
        // and on certain viewports the `.app-shell` itself can be the scroller.
        // Reset any element scrolled below 0 — cheap, safe, idempotent.
        const candidates = document.querySelectorAll<HTMLElement>(
          ".app-shell, [data-scroll-root]",
        );
        candidates.forEach((el) => {
          if (el.scrollTop !== 0) {
            el.scrollTop = 0;
          }
        });
      }
    };

    if (!prev || prev.pathname !== pathname) {
      snapToTop();
      // Re-snap after first paint in case mobile URL bar / async content shifts layout.
      const raf = window.requestAnimationFrame(snapToTop);
      // On initial mount specifically (e.g. just after sign-in), the iOS
      // keyboard dismiss animation can run AFTER our synchronous snap and
      // leave the page slightly scrolled.
      let timers: number[] = [];
      let viewportResizeHandler: (() => void) | null = null;
      if (!prev) {
        // Aggressive timer-based retries to outlast keyboard dismiss + URL bar settle.
        timers = [100, 250, 500, 1000, 1500].map((ms) =>
          window.setTimeout(snapToTop, ms),
        );
        // VisualViewport `resize` fires when the iOS keyboard finishes hiding —
        // re-snap then to fight the residual scroll iOS leaves us with. Listener
        // is unbound after the first ~2s so user-scroll isn't fought.
        if (typeof window !== "undefined" && window.visualViewport) {
          const vv = window.visualViewport;
          viewportResizeHandler = () => snapToTop();
          vv.addEventListener("resize", viewportResizeHandler);
          window.setTimeout(() => {
            if (viewportResizeHandler) {
              vv.removeEventListener("resize", viewportResizeHandler);
              viewportResizeHandler = null;
            }
          }, 2000);
        }
      }
      return () => {
        window.cancelAnimationFrame(raf);
        timers.forEach((t) => window.clearTimeout(t));
        if (viewportResizeHandler && window.visualViewport) {
          window.visualViewport.removeEventListener("resize", viewportResizeHandler);
        }
      };
    }
    if (prev.search === search) {
      return;
    }
    const onRecipeEdit = /^\/recipe\/[^/]+\/edit$/.test(pathname);
    if (onRecipeEdit) {
      const before = new URLSearchParams(
        prev.search.startsWith("?") ? prev.search.slice(1) : prev.search,
      );
      const after = new URLSearchParams(
        search.startsWith("?") ? search.slice(1) : search,
      );
      if (before.has(EDIT_RECIPE_STEP_QUERY) && !after.has(EDIT_RECIPE_STEP_QUERY)) {
        const stripped = new URLSearchParams(before);
        stripped.delete(EDIT_RECIPE_STEP_QUERY);
        if (stripped.toString() === after.toString()) {
          return;
        }
      }
    }
    snapToTop();
    const raf = window.requestAnimationFrame(snapToTop);
    return () => window.cancelAnimationFrame(raf);
  }, [pathname, search]);

  /** Drop add-to-plan cart in session when leaving the list/detail builder routes. */
  React.useEffect(() => {
    if (!isAddFlowBuilderLocation(pathname, search)) {
      clearActiveAddFlowSessionStorage();
    }
  }, [pathname, search]);

  React.useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className={wide ? "app-shell app-shell--wide" : "app-shell"}>
      {scrollDebug.length > 0 ? (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            background: "rgba(0,0,0,0.85)",
            color: "#0f0",
            font: "10px/1.3 monospace",
            padding: "6px 8px",
            maxHeight: "40vh",
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            pointerEvents: "auto",
          }}
        >
          {scrollDebug.join("\n")}
        </div>
      ) : null}
      <header className="app-chrome-bar">
        <button
          ref={menuBtnRef}
          type="button"
          className="app-chrome-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="app-nav-drawer"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="app-chrome-burger" aria-hidden>
            <span />
            <span />
            <span />
          </span>
        </button>
        <span className={`app-chrome-home${isPlannerHome ? " app-chrome-home--current" : ""}`}>
          {chromeTitle}
          <span className="app-chrome-user"> — {currentUser}</span>
        </span>
      </header>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="app-chrome-scrim"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="app-nav-drawer"
            className="app-chrome-drawer"
            aria-label="Main navigation"
          >
            <div className="app-chrome-drawer-head">
              <span className="app-chrome-drawer-title">Meal planner</span>
              <button
                type="button"
                className="app-chrome-drawer-close"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                ×
              </button>
            </div>
            <ul className="app-chrome-nav-list">
              <li>
                <Link
                  to="/"
                  className={isPlannerHome ? "app-chrome-nav-link app-chrome-nav-link--current" : "app-chrome-nav-link"}
                  aria-current={isPlannerHome ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  My menu
                </Link>
              </li>
              <li>
                <Link
                  to="/recipes"
                  className={
                    pathname === "/recipes" ? "app-chrome-nav-link app-chrome-nav-link--current" : "app-chrome-nav-link"
                  }
                  aria-current={pathname === "/recipes" ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Recipes
                </Link>
              </li>
              <li>
                <Link
                  to={shoppingListPath()}
                  className={
                    pathname === "/shopping"
                      ? "app-chrome-nav-link app-chrome-nav-link--current"
                      : "app-chrome-nav-link"
                  }
                  aria-current={pathname === "/shopping" ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Shopping list
                  {count > 0 ? (
                    <span className="app-chrome-nav-count">{count}</span>
                  ) : null}
                </Link>
              </li>
              <li>
                <Link
                  to={cookingNowNavTo}
                  className={
                    isCookingNowView
                      ? "app-chrome-nav-link app-chrome-nav-link--current"
                      : "app-chrome-nav-link"
                  }
                  aria-current={isCookingNowView ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Cooking now
                  {cookNowCount > 0 ? (
                    <span className="app-chrome-nav-count">{cookNowCount}</span>
                  ) : null}
                </Link>
              </li>
              <li>
                <Link
                  to="/history"
                  className={
                    pathname === "/history"
                      ? "app-chrome-nav-link app-chrome-nav-link--current"
                      : "app-chrome-nav-link"
                  }
                  aria-current={pathname === "/history" ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                >
                  Calendar
                </Link>
              </li>
            </ul>
            {onSignOut ? (
              <button
                type="button"
                className="app-chrome-nav-signout"
                onClick={() => { setMenuOpen(false); onSignOut(); }}
              >
                Sign out
              </button>
            ) : null}
          </nav>
        </>
      ) : null}

      <Routes>
        <Route
          path="/"
          element={<MealPlannerPage recipes={recipes} ingredients={ingredients} />}
        />
        <Route
          path="/recipes/new"
          element={<AddRecipePlaceholderPage />}
        />
        <Route path="/recipes" element={<RecipeList recipes={recipes} ingredients={ingredients} />} />
        <Route
          path="/recipe/:id/edit"
          element={
            <EditRecipePage
              recipes={recipes}
              ingredients={ingredients}
              ingredientsFile={ingredientsFile}
              onSaved={onRecipeSaved}
              currentUser={currentUser}
            />
          }
        />
        <Route
          path="/recipe/:id"
          element={
            <RecipeDetail
              recipes={recipes}
              ingredients={ingredients}
              currentUser={currentUser}
              onRecipeDeleted={(deletedId) =>
                setRawRecipes((prev) => prev ? prev.filter((r) => r.id !== deletedId) : prev)
              }
            />
          }
        />
        <Route
          path="/shopping"
          element={<ShoppingListPage recipes={recipes} ingredients={ingredients} />}
        />
        <Route path="/cooking-now" element={<CookingNowPage />} />
        <Route path="/history" element={<HistoryPage recipes={recipes} />} />
        <Route path="/place-order" element={<InstacartPlaceholderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
