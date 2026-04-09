import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe, RecommendedSideRef } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  LIST_TAB_QUERY,
  PLAN_PHASE_MAIN,
  PLAN_PHASE_QUERY,
  PLAN_PHASE_SIDE,
  homeListPath,
  readPlanPhaseSide,
  readSidesListTab,
  recipeDetailPath,
  shoppingListPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { AddToPlanSheet } from "./AddToPlanSheet";
import { recipeSegment } from "./recipeCourse";
import { useMealPlan } from "./MealPlanContext";
import { useShoppingList } from "./ShoppingListContext";

export function RecipeDetail({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromSidesList = readSidesListTab(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const listSidesTab = inPlanFlow ? readPlanPhaseSide(searchParams) : fromSidesList;

  const recipe = recipes.find((r) => r.id === id);
  const { count } = useShoppingList();
  const { addRecipeToPlanKey } = useMealPlan();
  const [planSheetRecipe, setPlanSheetRecipe] = React.useState<Recipe | null>(null);
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const addTargetToPlan = React.useCallback(
    (r: Recipe) => {
      if (!planKey) {
        setPlanSheetRecipe(r);
        return;
      }
      addRecipeToPlanKey(planKey, r);
      if (
        recipeSegment(r) !== "side" &&
        searchParams.get(PLAN_PHASE_QUERY) !== PLAN_PHASE_MAIN
      ) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set(PLAN_PHASE_QUERY, PLAN_PHASE_SIDE);
            p.delete(LIST_TAB_QUERY);
            return p;
          },
          { replace: true },
        );
      }
    },
    [planKey, addRecipeToPlanKey, searchParams, setSearchParams],
  );

  const preserve = inPlanFlow ? searchParams : undefined;

  if (!recipe) {
    return (
      <>
        <div className="top-bar">
          <Link to={homeListPath(listSidesTab, preserve)} className="back-btn">
            ← Back
          </Link>
        </div>
        <p className="empty">Recipe not found.</p>
      </>
    );
  }

  const recommended = recipe.recommendedSides ?? [];
  const sideRefs = React.useMemo(() => {
    const map = new Map<string, RecommendedSideRef>();
    for (const ref of recommended) {
      if (!map.has(ref.recipeId)) {
        map.set(ref.recipeId, ref);
      }
    }
    return [...map.entries()].map(([recipeId, ref]) => ({
      recipeId,
      label: ref.label,
      recipe: recipes.find((r) => r.id === recipeId),
    }));
  }, [recommended, recipes]);

  return (
    <>
      <div className="top-bar">
        <Link to={homeListPath(listSidesTab, preserve)} className="back-btn">
          ← Back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          {recipe.title}
          {recipe.type === "reference" ? (
            <span className="badge">Reference</span>
          ) : null}
          {recipeSegment(recipe) === "side" ? (
            <span className="badge badge-side">Side</span>
          ) : null}
        </h1>
      </div>
      {recipe.tags && recipe.tags.length > 0 ? (
        <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {recipe.tags.join(" · ")}
        </p>
      ) : null}

      {recipe.ingredientSections?.map((sec) => (
        <section key={sec.name} className="detail-section">
          <h2>{sec.name}</h2>
          {sec.lines.length === 0 ? (
            <p className="muted">No structured ingredients (see instructions).</p>
          ) : (
            <ul>
              {sec.lines.map((line, i) => (
                <li key={`${line.ingredientId}-${i}`}>
                  {formatIngredientLine(line, byId)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {sideRefs.length > 0 ? (
        <section className="detail-section recommended-sides-section">
          <h2>Recommended sides</h2>
          <p className="muted recommended-sides-intro">
            Open a side for full prep instructions. Use <strong>Add to plan</strong> to add to this meal
            {inPlanFlow ? "" : " (pick a day or leave unassigned)"}.
          </p>
          <ul className="recommended-sides-list">
            {sideRefs.map(({ recipeId, label, recipe: sideRecipe }) => {
              return (
                <li key={recipeId} className="recommended-side-card">
                  <div className="recommended-side-head">
                    {sideRecipe ? (
                      <Link
                        to={recipeDetailPath(recipeId, listSidesTab, preserve)}
                        className="recommended-side-title"
                      >
                        {sideRecipe.title}
                      </Link>
                    ) : (
                      <span className="recommended-side-title missing-side">
                        Missing recipe: {recipeId}
                      </span>
                    )}
                    {sideRecipe ? (
                      <button
                        type="button"
                        className="btn-primary btn-compact"
                        onClick={() => addTargetToPlan(sideRecipe)}
                      >
                        Add to plan
                      </button>
                    ) : null}
                  </div>
                  {label ? <p className="muted recommended-side-label">{label}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recipe.instructions && recipe.instructions.length > 0 ? (
        <section className="detail-section">
          <h2>Instructions</h2>
          <ol className="steps">
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.sourceUrl ? (
        <p className="detail-section">
          <a
            className="source-link"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Original recipe ↗
          </a>
        </p>
      ) : null}

      {recipe.notes ? (
        <p className="muted detail-section">{recipe.notes}</p>
      ) : null}

      <div className="cta-panel cta-panel-bottom">
        <button
          type="button"
          className="btn-primary btn-cta-wide"
          onClick={() => addTargetToPlan(recipe)}
        >
          Add to plan
        </button>
        <Link to={shoppingListPath(listSidesTab, preserve)} className="cta-sub-link">
          View shopping list{count > 0 ? ` (${count})` : ""}
        </Link>
      </div>

      <AddToPlanSheet
        recipe={planSheetRecipe}
        open={planSheetRecipe !== null}
        onClose={() => setPlanSheetRecipe(null)}
      />
    </>
  );
}
