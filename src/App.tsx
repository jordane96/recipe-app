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
import { EditRecipePlaceholderPage } from "./EditRecipePlaceholderPage";
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
import { readCookModeParams, shoppingListPath } from "./listTabSearch";
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

export default function App() {
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

  const recipes = React.useMemo(() => {
    if (!rawRecipes) {
      return null;
    }
    return applyQualitativeOverrides(rawRecipes, loadQualitativeOverrides());
  }, [rawRecipes]);

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
                <AppLayout recipes={recipes} ingredients={ingredients} />
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
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
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

  /** Snap to top on every in-app navigation (HashRouter does not scroll the window). */
  React.useEffect(() => {
    window.scrollTo(0, 0);
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
                  to={shoppingListPath(false)}
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
        <Route path="/recipe/:id/edit" element={<EditRecipePlaceholderPage />} />
        <Route
          path="/recipe/:id"
          element={<RecipeDetail recipes={recipes} ingredients={ingredients} />}
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
