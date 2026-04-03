import * as React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { loadRecipes } from "./loadRecipes";
import type { Recipe } from "./types";
import { RecipeDetail } from "./RecipeDetail";
import { RecipeList } from "./RecipeList";

export default function App() {
  const [recipes, setRecipes] = React.useState<Recipe[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadRecipes()
      .then((data) => {
        if (!cancelled) {
          setRecipes(data.recipes);
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

  return (
    <HashRouter>
      <div className="app-shell">
        {err ? <p className="err">{err}</p> : null}
        {recipes === null && !err ? (
          <p className="muted">Loading…</p>
        ) : null}
        {recipes ? (
          <Routes>
            <Route path="/" element={<RecipeList recipes={recipes} />} />
            <Route path="/recipe/:id" element={<RecipeDetail recipes={recipes} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : null}
      </div>
    </HashRouter>
  );
}
