import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe, RecommendedSideRef } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  readCookModeParams,
  readFromHistory,
  readFromPlanner,
  readFromShopping,
  readPlanPhaseSide,
  readPlannerMenuCookContext,
  readSidesListTab,
  recipeCookModePath,
  recipeDetailBackPath,
  readRecipeListPickExperience,
  recipeDetailPath,
  recipeEditPath,
  recipeDetailAddCtaLabel,
  recipesListAddToCartPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { addFlowCartSessionKey, setActiveAddFlowSessionKey } from "./addFlowCartSession";
import { recipeSegment } from "./recipeCourse";
import { MEAL_PLAN_UNASSIGNED_KEY } from "./mealPlanStorage";
import { useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";
import { RecipeCookModePanel } from "./RecipeCookModePanel";
import { normalizeInstructionStep } from "./recipeInstructions";
import { loadCookUi } from "./cookModeSessionStorage";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  getCookProgressSessions,
  type CookProgressEntry,
} from "./cookProgressSession";

function slotParamFromCookProgressEntry(e: CookProgressEntry): string | null {
  return e.slotRef.length > 0 ? e.slotRef : null;
}

/** If the same recipe was planned on multiple days, prefer the session with the furthest saved step, then latest date. */
function pickActiveCookProgressEntry(recipeId: string): CookProgressEntry | null {
  const list = getCookProgressSessions().filter((e) => e.recipeId === recipeId);
  if (list.length === 0) {
    return null;
  }
  if (list.length === 1) {
    return list[0]!;
  }
  const stepFor = (e: CookProgressEntry) =>
    loadCookUi(e.recipeId, e.cookDate, slotParamFromCookProgressEntry(e))?.activeStepIndex ?? 0;
  return list.reduce((best, cur) => {
    const sb = stepFor(best);
    const sc = stepFor(cur);
    if (sc > sb) {
      return cur;
    }
    if (sc < sb) {
      return best;
    }
    return cur.cookDate >= best.cookDate ? cur : best;
  });
}

export function RecipeDetail({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSidesList = readSidesListTab(searchParams);
  const fromShopping = readFromShopping(searchParams);
  const fromHistory = readFromHistory(searchParams);
  const fromPlanner = readFromPlanner(searchParams);
  const plannerMenuCtx = readPlannerMenuCookContext(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const listSidesTab = inPlanFlow ? readPlanPhaseSide(searchParams) : fromSidesList;
  const preserve =
    inPlanFlow || fromShopping || fromHistory || fromPlanner ? searchParams : undefined;
  const pickExperience = readRecipeListPickExperience(searchParams);
  const isShopMenuBuildFlow = pickExperience === "shop";
  const isCookNowPickFlow = pickExperience === "cook";
  const addToCartSelectionLabel = recipeDetailAddCtaLabel(searchParams);

  const recipe = recipes.find((r) => r.id === id);
  const cookParams = readCookModeParams(searchParams);
  const { addRecipeToPlanKey } = useMealPlan();
  const { showToast } = useToast();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const [cookProgressRev, setCookProgressRev] = React.useState(0);
  React.useEffect(() => {
    const on = () => setCookProgressRev((n) => n + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
  }, []);

  const activeCookForRecipe = React.useMemo(() => {
    if (!recipe) {
      return null;
    }
    return pickActiveCookProgressEntry(recipe.id);
  }, [recipe, cookProgressRev]);

  const addTargetToPlan = React.useCallback(
    (r: Recipe) => {
      if (planKey != null) {
        navigate(recipesListAddToCartPath(searchParams, r.id));
        showToast(`Added “${r.title}” to your selection.`);
        return;
      }
      const key = MEAL_PLAN_UNASSIGNED_KEY;
      addRecipeToPlanKey(key, r);
      showToast(`Added “${r.title}” to your menu.`);
    },
    [planKey, addRecipeToPlanKey, navigate, searchParams, showToast],
  );

  /**
   * Keep the add-flow “active key” in sync on recipe detail (list unmounts when you open a recipe).
   * Clear when leaving cart-builder URL context (handled in App) or in active cook mode.
   */
  React.useLayoutEffect(() => {
    if (cookParams.cookMode && cookParams.cookDate) {
      setActiveAddFlowSessionKey(null);
      return;
    }
    if (planKey != null) {
      const k = addFlowCartSessionKey(searchParams);
      if (k) {
        setActiveAddFlowSessionKey(k);
      }
    } else {
      setActiveAddFlowSessionKey(null);
    }
  }, [cookParams.cookMode, cookParams.cookDate, planKey, searchParams.toString()]);

  /** Must run before any early return — same hook order in cook mode vs full detail. */
  const sideRefs = React.useMemo(() => {
    if (!recipe) {
      return [] as { recipeId: string; label: string; recipe: Recipe | undefined }[];
    }
    const recommended = recipe.recommendedSides ?? [];
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
  }, [recipe, recipes]);

  if (!recipe) {
    return (
      <>
        <div className="top-bar">
          <Link
            to={recipeDetailBackPath(id ?? "", listSidesTab, preserve, fromShopping, fromHistory, searchParams)}
            className="back-btn"
          >
            Back
          </Link>
        </div>
        <p className="empty">Recipe not found.</p>
      </>
    );
  }

  if (cookParams.cookMode && cookParams.cookDate) {
    return (
      <RecipeCookModePanel
        key={`${recipe.id}-${cookParams.cookDate}-${cookParams.cookSlotRef ?? ""}`}
        recipe={recipe}
        cookDate={cookParams.cookDate}
        cookSlotRef={cookParams.cookSlotRef}
        ingredients={ingredients}
      />
    );
  }

  return (
    <div className="recipe-detail-page recipe-detail-page--bottom-cta">
      <div className="top-bar">
        <h1 className="page-title recipe-detail-page-title" style={{ fontSize: "1.25rem" }}>
          <span className="recipe-detail-headline">
            <span className="recipe-detail-title-text">{recipe.title}</span>
            <Link
              to={recipeEditPath(recipe.id, listSidesTab, preserve)}
              className="recipe-detail-edit-link"
            >
              edit
            </Link>
          </span>
          {recipe.type === "reference" ? (
            <span className="badge">Reference</span>
          ) : null}
          {recipeSegment(recipe) === "side" ? (
            <span className="badge badge-side">Side</span>
          ) : null}
        </h1>
      </div>
      {!cookParams.cookMode && activeCookForRecipe ? (
        <div className="recipe-detail-resume-cook">
          <p className="recipe-detail-resume-cook-text">
            You have an active cook session for this recipe — reopen cook mode to pick up where you left off.
          </p>
          <Link
            to={recipeCookModePath(
              activeCookForRecipe.recipeId,
              activeCookForRecipe.cookDate,
              slotParamFromCookProgressEntry(activeCookForRecipe),
            )}
            className="btn-primary btn-compact recipe-detail-resume-cook-btn"
          >
            Continue cooking
          </Link>
        </div>
      ) : null}
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
            Open a side for full prep instructions. Use <strong>{addToCartSelectionLabel}</strong> to
            add to this meal
            {inPlanFlow
              ? isShopMenuBuildFlow
                ? " (adds to your pick on the recipe list; confirm there to add to your list and menu)."
                : isCookNowPickFlow
                  ? " (adds to your cook-now pick on the recipe list)."
                  : " (adds to your pick on the recipe list)."
              : " (goes to This week’s menu; set a day from the Plan tab)."}
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
                        Add to menu
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
            {recipe.instructions.map((step, i) => {
              const n = normalizeInstructionStep(step);
              return (
                <li key={i}>
                  <span className="recipe-step-text">{n.text}</span>
                  {n.stepIngredients && n.stepIngredients.length > 0 ? (
                    <ul className="recipe-step-ingredients" aria-label="For this step">
                      {n.stepIngredients.map((label, j) => (
                        <li key={`${i}-${j}`}>{label}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
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

      <div
        className="recipe-list-cart-bar"
        role="region"
        aria-label={fromPlanner && plannerMenuCtx ? "Cook now and navigation" : "Add to menu and navigation"}
      >
        <div className="recipe-list-cart-bar-inner">
          {fromPlanner && plannerMenuCtx ? (
            <>
              <Link
                to={recipeCookModePath(
                  recipe.id,
                  plannerMenuCtx.dateIso,
                  plannerMenuCtx.planSlotRef,
                )}
                className="btn-primary btn-cta-wide"
              >
                Cook now
              </Link>
              <Link
                to={recipeDetailBackPath(
                  recipe.id,
                  listSidesTab,
                  preserve,
                  fromShopping,
                  fromHistory,
                  searchParams,
                )}
                className="btn-secondary btn-cta-wide recipe-detail-back-cta"
              >
                Back
              </Link>
            </>
          ) : fromPlanner ? (
            <Link
              to={recipeDetailBackPath(
                recipe.id,
                listSidesTab,
                preserve,
                fromShopping,
                fromHistory,
                searchParams,
              )}
              className="btn-secondary btn-cta-wide recipe-detail-back-cta"
            >
              Back
            </Link>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary btn-cta-wide"
                onClick={() => addTargetToPlan(recipe)}
              >
                {addToCartSelectionLabel}
              </button>
              <Link
                to={recipeDetailBackPath(
                  recipe.id,
                  listSidesTab,
                  preserve,
                  fromShopping,
                  fromHistory,
                  searchParams,
                )}
                className="btn-secondary btn-cta-wide recipe-detail-back-cta"
              >
                Back
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
