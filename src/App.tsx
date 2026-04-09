import * as React from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { applyQualitativeOverrides, loadQualitativeOverrides } from "./qualitativeOverrides";
import { loadRecipeBundle } from "./loadRecipes";
import { MealPlannerPage } from "./MealPlannerPage";
import type { IngredientsFile, Recipe } from "./types";
import { RecipeDetail } from "./RecipeDetail";
import { RecipeList } from "./RecipeList";
import { ShoppingListProvider } from "./ShoppingListContext";
import { ShoppingListPage } from "./ShoppingListPage";

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
          setRawRecipes(bundle.recipes.recipes);
          setIngredientsFile(bundle.ingredients);
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
      <AppShell>
        {err ? <p className="err">{err}</p> : null}
        {!ready && !err ? <p className="muted">Loading…</p> : null}
        {ready ? (
          <ShoppingListProvider>
            <Routes>
              <Route
                path="/"
                element={
                  <MealPlannerPage recipes={recipes} ingredients={ingredients} />
                }
              />
              <Route
                path="/recipes"
                element={
                  <RecipeList recipes={recipes} ingredients={ingredients} />
                }
              />
              <Route
                path="/recipe/:id"
                element={
                  <RecipeDetail recipes={recipes} ingredients={ingredients} />
                }
              />
              <Route
                path="/shopping"
                element={
                  <ShoppingListPage recipes={recipes} ingredients={ingredients} />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ShoppingListProvider>
        ) : null}
      </AppShell>
    </HashRouter>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const wide = pathname === "/" || pathname === "";
  return (
    <div className={wide ? "app-shell app-shell--wide" : "app-shell"}>
      {children}
    </div>
  );
}
