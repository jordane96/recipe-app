import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe, RecommendedSideRef } from "./types";
import { tagLabel } from "./tagFacets";
import { formatIngredientLine, ingredientMapWithRecipes } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  readCookModeParams,
  readFromHistory,
  readFromPlanner,
  readFromShopping,
  readFromShoppingListItem,
  readPlannerMenuCookContext,
  recipeCookModePath,
  recipeDetailBackPath,
  readRecipeListPickExperience,
  recipeDetailPath,
  recipeEditPath,
  recipeDetailAddCtaLabel,
  recipesListAddToCartPath,
  shoppingListPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { addFlowCartSessionKey, setActiveAddFlowSessionKey } from "./addFlowCartSession";
import { MEAL_PLAN_UNASSIGNED_KEY, newPlanSlotRef } from "./mealPlanStorage";
import { iso } from "./mealPlanDates";
import { recipeToPlannedMeal, useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";
import { useSavedRecipes } from "./SavedRecipesContext";
import { useShoppingList } from "./ShoppingListContext";
import { RecipeCookModePanel } from "./RecipeCookModePanel";
import { normalizeInstructionStep } from "./recipeInstructions";
import { loadCookUi } from "./cookModeSessionStorage";
import {
  addCookProgressSessionsBatch,
  COOK_PROGRESS_CHANGED_EVENT,
  getCookProgressSessions,
  type CookProgressEntry,
} from "./cookProgressSession";

function slotParamFromCookProgressEntry(e: CookProgressEntry): string | null {
  return e.slotRef.length > 0 ? e.slotRef : null;
}

/**
 * Bottom-bar CTA icons. Inline SVG in the same outline style the rest of the app uses
 * (24 viewBox, currentColor, round caps) so they inherit each button's colour on their own —
 * no extra rules needed for the filled "on list" state.
 */
function CtaIcon({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      className="btn-cta-icon-glyph"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const IconCalendarPlus = () => (
  <CtaIcon>
    <path d="M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6" />
    <path d="M16 3v4" />
    <path d="M8 3v4" />
    <path d="M4 11h16" />
    <path d="M16 19h6" />
    <path d="M19 16v6" />
  </CtaIcon>
);

const IconFlame = () => (
  <CtaIcon>
    <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z" />
  </CtaIcon>
);

const IconCart = () => (
  <CtaIcon>
    <path d="M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M17 17h-11v-14h-2" />
    <path d="M6 5l14 1l-1 7h-13" />
  </CtaIcon>
);

const IconCheck = () => (
  <CtaIcon>
    <path d="M5 12l5 5l10 -10" />
  </CtaIcon>
);

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
  currentUser,
  onRecipeDeleted,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  currentUser?: string;
  onRecipeDeleted?: (id: string) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [restoring, setRestoring] = React.useState(false);

  const handleRestoreOriginal = async (recipe: Recipe) => {
    if (!recipe.forkedFromRecipeId || restoring) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}?user=${encodeURIComponent(currentUser ?? "")}`, {
        method: "DELETE",
      });
      if (res.ok) {
        window.location.hash = `#/recipe/${recipe.forkedFromRecipeId}`;
        window.location.reload();
      }
    } finally {
      setRestoring(false);
    }
  };
  const [searchParams] = useSearchParams();
  const fromShopping = readFromShopping(searchParams);
  const fromShoppingListItem = readFromShoppingListItem(searchParams);
  const fromHistory = readFromHistory(searchParams);
  const fromPlanner = readFromPlanner(searchParams);
  const plannerMenuCtx = readPlannerMenuCookContext(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const preserve =
    inPlanFlow || fromShopping || fromShoppingListItem || fromHistory || fromPlanner
      ? searchParams
      : undefined;
  const pickExperience = readRecipeListPickExperience(searchParams);
  const isShopMenuBuildFlow = pickExperience === "shop";
  const isCookNowPickFlow = pickExperience === "cook";
  const addToCartSelectionLabel = recipeDetailAddCtaLabel(searchParams);

  const recipe = recipes.find((r) => r.id === id);
  const cookParams = readCookModeParams(searchParams);
  const { addRecipeToPlanKey, addPlannedMealsToKey } = useMealPlan();
  const { addToList, isSelected, removeAllSlotsForRecipe } = useShoppingList();
  const { showToast } = useToast();
  const { isSaved, saveRecipe } = useSavedRecipes();
  // Recipe-aware so custom-* ids resolve to their human names (e.g. "Spinach", not "custom-spinach").
  const byId = React.useMemo(
    () => ingredientMapWithRecipes(ingredients, recipe ? [recipe] : []),
    [ingredients, recipe],
  );

  const isOtherUsersRecipe = !!(recipe && recipe.owner && recipe.owner !== currentUser);
  const showSaveCta = isOtherUsersRecipe && recipe && !isSaved(recipe.id);
  const handleSaveRecipe = React.useCallback(async () => {
    if (!recipe) return;
    try {
      await saveRecipe(recipe.id);
      showToast("Recipe saved!");
    } catch {
      showToast("Couldn't save — please try again.");
    }
  }, [recipe, saveRecipe, showToast]);

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
      // Shopping-list "add more recipes" flow: add straight to the menu + shopping list (one click,
      // matching the picker's commit) and return to the picker, instead of staging it and requiring
      // a second commit click.
      if (isShopMenuBuildFlow) {
        addRecipeToPlanKey(MEAL_PLAN_UNASSIGNED_KEY, r);
        addToList(r.id);
        showToast(`Added “${r.title}” to your menu and shopping list.`);
        navigate(recipeDetailBackPath(id ?? "", preserve, fromHistory, searchParams));
        return;
      }
      if (planKey != null) {
        navigate(recipesListAddToCartPath(searchParams, r.id));
        showToast(`Added “${r.title}” to your selection.`);
        return;
      }
      const key = MEAL_PLAN_UNASSIGNED_KEY;
      addRecipeToPlanKey(key, r);
      // This branch leaves you on the recipe, unlike the other add paths which navigate on
      // completion — so the menu is only reachable via the drawer. Offer it from the toast.
      showToast(`Added “${r.title}” to your menu.`, {
        label: "View menu",
        onAction: () => navigate("/"),
      });
    },
    [
      isShopMenuBuildFlow,
      addToList,
      planKey,
      addRecipeToPlanKey,
      navigate,
      searchParams,
      showToast,
      id,
      preserve,
      fromHistory,
    ],
  );

  /**
   * "Cook now" outside the planner. Cook mode is keyed by (recipe, date, slot), so there has to
   * be a slot to cook — this adds the recipe to the menu pool with a fresh slot ref and starts a
   * session against today, then opens cook mode. Same sequence the recipe list's cook-now pick
   * flow uses, so both routes produce identical state.
   */
  const startCookingNow = React.useCallback(
    (r: Recipe) => {
      const todayIso = iso(new Date());
      const slotRef = newPlanSlotRef();
      addPlannedMealsToKey(MEAL_PLAN_UNASSIGNED_KEY, [
        { ...recipeToPlannedMeal(r), planSlotRef: slotRef },
      ]);
      addCookProgressSessionsBatch([
        { recipeId: r.id, cookDate: todayIso, planSlotRef: slotRef, title: r.title },
      ]);
      navigate(recipeCookModePath(r.id, todayIso, slotRef));
    },
    [addPlannedMealsToKey, navigate],
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
            to={recipeDetailBackPath(id ?? "", preserve, fromHistory, searchParams)}
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

  const recipeOnShoppingList = isSelected(recipe.id);
  /** Browsing a recipe normally — not picking one for a plan/shop flow, not someone else's. */
  const plainRecipeView = !inPlanFlow && !fromShoppingListItem && !showSaveCta;

  return (
    <div className="recipe-detail-page recipe-detail-page--bottom-cta">
      <div className="top-bar">
        <h1 className="page-title recipe-detail-page-title" style={{ fontSize: "1.25rem" }}>
          <span className="recipe-detail-headline">
            <span className="recipe-detail-title-text">{recipe.title}</span>
            <Link
              to={recipeEditPath(recipe.id, preserve)}
              className="recipe-detail-edit-link"
            >
              edit
            </Link>
            {recipe.forkedFromRecipeId && recipe.owner === currentUser ? (
              <button
                type="button"
                className="recipe-detail-restore-btn"
                onClick={() => handleRestoreOriginal(recipe)}
                disabled={restoring}
              >
                {restoring ? "Restoring…" : "Restore original"}
              </button>
            ) : null}
          </span>
          {recipe.type === "reference" ? (
            <span className="badge">Reference</span>
          ) : null}
        </h1>
      </div>
      {isOtherUsersRecipe && recipe.owner ? (
        <p className="recipe-detail-owner">By {recipe.owner}</p>
      ) : null}
      {recipe.description?.trim() ? (
        <p className="recipe-detail-description">{recipe.description.trim()}</p>
      ) : null}
      {typeof recipe.servings === "number" && recipe.servings > 0 ? (
        <p className="recipe-detail-servings">
          Serves {recipe.servings}
        </p>
      ) : null}
      {(recipe.tags ?? []).length > 0 ? (
        <ul className="recipe-detail-tags" aria-label="Tags">
          {(recipe.tags ?? []).map((t) => (
            <li key={t} className="recipe-detail-tag">
              {tagLabel(t)}
            </li>
          ))}
        </ul>
      ) : null}
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
                        to={recipeDetailPath(recipeId, preserve)}
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
                  {n.note ? (
                    <span className="recipe-step-note" role="note">
                      <span className="recipe-step-note-lead">Note:</span> {n.note}
                    </span>
                  ) : null}
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
            Recipe link ↗
          </a>
        </p>
      ) : null}

      {recipe.notes ? (
        <p className="muted detail-section">{recipe.notes}</p>
      ) : null}

      <div
        className="recipe-list-cart-bar"
        role="region"
        aria-label={
          fromPlanner && plannerMenuCtx
            ? "Cook now and navigation"
            : fromShoppingListItem && !fromPlanner
              ? "Navigation"
              : "Add to menu and navigation"
        }
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
                  preserve,
                  fromHistory,
                  searchParams,
                )}
                className="btn-secondary btn-cta-wide recipe-detail-back-cta"
              >
                ← Back
              </Link>
            </>
          ) : fromPlanner ? (
            <Link
              to={recipeDetailBackPath(
                recipe.id,
                preserve,
                fromHistory,
                searchParams,
              )}
              className="btn-secondary btn-cta-wide recipe-detail-back-cta"
            >
              ← Back
            </Link>
          ) : (
            <>
              {/* Plain recipe view: menu / cook / shop are three peer destinations, so they share
                  one row. The pick and save flows below keep a single wide CTA — inside those the
                  primary action already commits somewhere and the other two would compete. */}
              {plainRecipeView ? (
                <div className="recipe-detail-cta-row">
                  <button
                    type="button"
                    className="btn-primary btn-cta-tri"
                    onClick={() => addTargetToPlan(recipe)}
                  >
                    <IconCalendarPlus />
                    {addToCartSelectionLabel}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary btn-cta-tri"
                    onClick={() => startCookingNow(recipe)}
                  >
                    <IconFlame />
                    Cook now
                  </button>
                  <button
                    type="button"
                    className={`btn-cta-tri${
                      recipeOnShoppingList ? " btn-primary" : " btn-secondary"
                    }`}
                    aria-pressed={recipeOnShoppingList}
                    aria-label={
                      recipeOnShoppingList
                        ? `Remove ${recipe.title} from your shopping list`
                        : `Add ${recipe.title} to your shopping list`
                    }
                    onClick={() => {
                      if (recipeOnShoppingList) {
                        removeAllSlotsForRecipe(recipe.id);
                        showToast(`Removed “${recipe.title}” from your shopping list.`);
                      } else {
                        addToList(recipe.id);
                        // The list is the whole point of the action, but it's two taps away
                        // behind the menu — offer it straight from the confirmation.
                        showToast(`Added “${recipe.title}” to your shopping list.`, {
                          label: "View list",
                          onAction: () => navigate(shoppingListPath()),
                        });
                      }
                    }}
                  >
                    {recipeOnShoppingList ? <IconCheck /> : <IconCart />}
                    {recipeOnShoppingList ? "On list" : "Shop recipe"}
                  </button>
                </div>
              ) : showSaveCta ? (
                <button
                  type="button"
                  className="btn-primary btn-cta-wide"
                  onClick={handleSaveRecipe}
                >
                  Save to my recipes
                </button>
              ) : !fromShoppingListItem ? (
                <button
                  type="button"
                  className="btn-primary btn-cta-wide"
                  onClick={() => addTargetToPlan(recipe)}
                >
                  {addToCartSelectionLabel}
                </button>
              ) : null}
              <Link
                to={recipeDetailBackPath(
                  recipe.id,
                  preserve,
                  fromHistory,
                  searchParams,
                )}
                className="btn-secondary btn-cta-wide recipe-detail-back-cta"
              >
                ← Back
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
