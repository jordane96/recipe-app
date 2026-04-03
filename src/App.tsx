import * as React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  applyQualitativeOverrides,
  loadQualitativeOverrides,
  QUALITATIVE_OVERRIDES_CHANGED,
} from "./qualitativeOverrides";
import { loadRecipeBundle } from "./loadRecipes";
import type { IngredientsFile, Recipe } from "./types";
import { QualitativeReviewPage } from "./QualitativeReviewPage";
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
  const [overrideRev, setOverrideRev] = React.useState(0);

  React.useEffect(() => {
    const onChanged = () => setOverrideRev((n) => n + 1);
    window.addEventListener(QUALITATIVE_OVERRIDES_CHANGED, onChanged);
    return () => window.removeEventListener(QUALITATIVE_OVERRIDES_CHANGED, onChanged);
  }, []);

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
  }, [rawRecipes, overrideRev]);

  const ingredients = ingredientsFile?.ingredients ?? [];
  const ready = recipes && ingredientsFile;

  return (
    <HashRouter>
      <div className="app-shell">
        {err ? <p className="err">{err}</p> : null}
        {!ready && !err ? <p className="muted">Loading…</p> : null}
        {ready ? (
          <ShoppingListProvider>
            <Routes>
              <Route
                path="/"
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
              <Route
                path="/qualitative"
                element={
                  <QualitativeReviewPage
                    recipes={rawRecipes!}
                    ingredients={ingredients}
                    units={ingredientsFile.units}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ShoppingListProvider>
        ) : null}
      </div>
    </HashRouter>
  );
}
