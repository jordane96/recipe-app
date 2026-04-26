import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_CART_QUERY,
  ADD_TO_PLAN_QUERY,
  COOK_ON_ADD_QUERY,
  COOK_ON_ADD_VALUE,
  FROM_QUERY,
  LIST_TAB_QUERY,
  LIST_TAB_SIDE_VALUE,
  PLAN_PHASE_MAIN,
  PLAN_PHASE_QUERY,
  PLAN_PHASE_SIDE,
  PLAN_WEEK_START_QUERY,
  SHOP_MENU_BUILD_QUERY,
  readPlanPhaseSide,
  readRecipeListPickExperience,
  readSidesListTab,
  recipeCookModePath,
  recipeDetailPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { useShoppingList } from "./ShoppingListContext";
import { weekRangeLabel } from "./mealPlanDates";
import { instructionStepText } from "./recipeInstructions";
import { recipeSegment, SEGMENT_LABEL } from "./recipeCourse";
import {
  isMealPlanDateKey,
  MEAL_PLAN_UNASSIGNED_KEY,
  newPlanSlotRef,
  type MealPlanByDate,
  type PlannedMeal,
} from "./mealPlanStorage";
import { addCookProgressSessionsBatch } from "./cookProgressSession";
import { iso } from "./mealPlanDates";
import { recipeToPlannedMeal, useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";
import { addFlowCartSessionKey, setActiveAddFlowSessionKey } from "./addFlowCartSession";

/** Which top-level tab is active on the recipe list (reference items show under Mains). */
type CourseTab = "main" | "side";

function planTargetLabel(planKey: string, searchParams: URLSearchParams): string {
  if (planKey === MEAL_PLAN_UNASSIGNED_KEY) {
    const ws = searchParams.get(PLAN_WEEK_START_QUERY);
    if (ws && isMealPlanDateKey(ws)) {
      return weekRangeLabel(new Date(`${ws}T12:00:00`));
    }
    return "Unassigned";
  }
  return new Date(`${planKey}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function inCourseTab(r: Recipe, tab: CourseTab): boolean {
  const seg = recipeSegment(r);
  if (tab === "side") {
    return seg === "side";
  }
  return seg === "main" || seg === "other";
}

function uniqueTags(recipes: Recipe[]): string[] {
  const s = new Set<string>();
  for (const r of recipes) {
    for (const t of r.tags ?? []) {
      s.add(t);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function loadAddFlowIds(key: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) {
      return new Set();
    }
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) {
      return new Set();
    }
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function saveAddFlowIds(key: string, ids: Set<string>): void {
  try {
    if (ids.size === 0) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify([...ids]));
    }
  } catch {
    // quota / private mode
  }
}

function matches(
  recipe: Recipe,
  q: string,
  tag: string | null,
  byId: Map<string, IngredientDef>,
): boolean {
  if (tag && !(recipe.tags?.includes(tag))) {
    return false;
  }
  if (!q.trim()) {
    return true;
  }
  const needle = q.trim().toLowerCase();
  if (recipe.title.toLowerCase().includes(needle)) {
    return true;
  }
  for (const sec of recipe.ingredientSections ?? []) {
    if (sec.name.toLowerCase().includes(needle)) {
      return true;
    }
    for (const line of sec.lines) {
      const def = byId.get(line.ingredientId);
      if (def?.name.toLowerCase().includes(needle)) {
        return true;
      }
      if (formatIngredientLine(line, byId).toLowerCase().includes(needle)) {
        return true;
      }
    }
  }
  for (const line of recipe.instructions ?? []) {
    if (instructionStepText(line).toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

export function RecipeList({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { plan, addPlannedMealsToKey } = useMealPlan();
  const recipeById = React.useMemo(
    () => new Map<string, Recipe>(recipes.map((r) => [r.id, r])),
    [recipes],
  );
  const { showToast } = useToast();
  const { addToList } = useShoppingList();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  /** Add-to-menu flow: at most one pending add per recipe (order = tap order). */
  const [addFlowSelectedIds, setAddFlowSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const pickExperience = readRecipeListPickExperience(searchParams);
  const isShopMenuBuildFlow = pickExperience === "shop";
  const isCookNowPickFlow = pickExperience === "cook";
  const cookOnAdd = inPlanFlow && searchParams.get(COOK_ON_ADD_QUERY) === COOK_ON_ADD_VALUE;
  const addFlowBack = React.useCallback(() => {
    if (isShopMenuBuildFlow) {
      navigate("/shopping");
      return;
    }
    if (isCookNowPickFlow) {
      navigate("/cooking-now");
      return;
    }
    navigate("/");
  }, [isCookNowPickFlow, isShopMenuBuildFlow, navigate]);

  const addFlowStorageKey = React.useMemo(
    () => (inPlanFlow && planKey != null ? addFlowCartSessionKey(searchParams) : null),
    // Stringify: `searchParams` from react-router is a new object most renders; key must be stable.
    [inPlanFlow, planKey, searchParams.toString()],
  );
  const lastAddFlowKeyForCleanupRef = React.useRef<string | null>(null);

  const courseTab: CourseTab =
    inPlanFlow ? (readPlanPhaseSide(searchParams) ? "side" : "main") : readSidesListTab(searchParams)
      ? "side"
      : "main";

  const setCourseTab = React.useCallback(
    (tab: CourseTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          const pk = urlParamToPlanKey(p.get(ADD_TO_PLAN_QUERY));
          if (pk != null) {
            p.set(PLAN_PHASE_QUERY, tab === "side" ? PLAN_PHASE_SIDE : PLAN_PHASE_MAIN);
            p.delete(LIST_TAB_QUERY);
          } else {
            if (tab === "side") {
              p.set(LIST_TAB_QUERY, LIST_TAB_SIDE_VALUE);
            } else {
              p.delete(LIST_TAB_QUERY);
            }
            p.delete(PLAN_PHASE_QUERY);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  React.useEffect(() => {
    setTag(null);
  }, [courseTab]);

  React.useEffect(() => {
    const raw = searchParams.get(ADD_TO_PLAN_QUERY);
    if (raw && urlParamToPlanKey(raw) == null) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete(ADD_TO_PLAN_QUERY);
          p.delete(PLAN_PHASE_QUERY);
          p.delete(PLAN_WEEK_START_QUERY);
          p.delete(SHOP_MENU_BUILD_QUERY);
          p.delete(COOK_ON_ADD_QUERY);
          p.delete(FROM_QUERY);
          p.delete(ADD_TO_CART_QUERY);
          return p;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  React.useLayoutEffect(() => {
    if (addFlowStorageKey) {
      lastAddFlowKeyForCleanupRef.current = addFlowStorageKey;
      setActiveAddFlowSessionKey(addFlowStorageKey);
      setAddFlowSelectedIds(loadAddFlowIds(addFlowStorageKey));
      return;
    }
    setActiveAddFlowSessionKey(null);
    const leavings = lastAddFlowKeyForCleanupRef.current;
    if (leavings) {
      try {
        sessionStorage.removeItem(leavings);
      } catch {
        // ignore
      }
      lastAddFlowKeyForCleanupRef.current = null;
    }
    setAddFlowSelectedIds(new Set());
  }, [addFlowStorageKey]);

  const addToAddFlowCart = React.useCallback(
    (r: Recipe) => {
      if (!addFlowStorageKey) {
        return;
      }
      setAddFlowSelectedIds((prev) => {
        if (prev.has(r.id)) {
          return prev;
        }
        const next = new Set([...prev, r.id]);
        saveAddFlowIds(addFlowStorageKey, next);
        return next;
      });
    },
    [addFlowStorageKey],
  );

  const oneShotAddToCartId = searchParams.get(ADD_TO_CART_QUERY);
  React.useEffect(() => {
    if (!oneShotAddToCartId || !inPlanFlow || planKey == null) {
      return;
    }
    const r = recipeById.get(oneShotAddToCartId);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete(ADD_TO_CART_QUERY);
        return p;
      },
      { replace: true },
    );
    if (r) {
      addToAddFlowCart(r);
    }
  }, [oneShotAddToCartId, inPlanFlow, planKey, recipeById, addToAddFlowCart, setSearchParams]);

  const removeFromAddFlowCart = React.useCallback(
    (r: Recipe) => {
      if (!addFlowStorageKey) {
        return;
      }
      setAddFlowSelectedIds((prev) => {
        if (!prev.has(r.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(r.id);
        saveAddFlowIds(addFlowStorageKey, next);
        return next;
      });
    },
    [addFlowStorageKey],
  );

  const handleCommitAddFlowCart = React.useCallback(() => {
    if (addFlowSelectedIds.size === 0 || planKey == null) {
      return;
    }
    const recipeList = Array.from(addFlowSelectedIds)
      .map((id) => recipeById.get(id))
      .filter((x): x is Recipe => x != null);
    if (recipeList.length === 0) {
      return;
    }
    const baseEntries: PlannedMeal[] = recipeList.map((r) => recipeToPlannedMeal(r));
    const withSlots: PlannedMeal[] =
      planKey === MEAL_PLAN_UNASSIGNED_KEY
        ? baseEntries.map((e) => ({ ...e, planSlotRef: newPlanSlotRef() }))
        : baseEntries;
    addPlannedMealsToKey(planKey, withSlots);
    const n = withSlots.length;
    if (addFlowStorageKey) {
      try {
        sessionStorage.removeItem(addFlowStorageKey);
      } catch {
        // ignore
      }
    }
    setAddFlowSelectedIds(new Set());
    if (isShopMenuBuildFlow) {
      for (const id of addFlowSelectedIds) {
        addToList(id);
      }
      showToast(`Added ${n} to your menu and shopping list.`);
      navigate("/shopping");
      return;
    }
    if (cookOnAdd && planKey === MEAL_PLAN_UNASSIGNED_KEY) {
      const todayIso = iso(new Date());
      addCookProgressSessionsBatch(
        withSlots.map((m) => ({
          recipeId: m.id,
          cookDate: todayIso,
          planSlotRef: m.planSlotRef,
          title: m.title,
        })),
      );
      const first = withSlots[0]!;
      const slot = first.planSlotRef && first.planSlotRef.length > 0 ? first.planSlotRef : null;
      showToast(`Added ${n} to your menu — let’s cook!`);
      navigate(recipeCookModePath(first.id, todayIso, slot));
      return;
    }
    showToast(`Added ${n} ${n === 1 ? "meal" : "meals"} to your menu`);
    navigate("/");
  }, [
    addFlowSelectedIds,
    addFlowStorageKey,
    addPlannedMealsToKey,
    addToList,
    cookOnAdd,
    isShopMenuBuildFlow,
    navigate,
    planKey,
    recipeById,
    showToast,
  ]);

  const tabPool = React.useMemo(
    () => recipes.filter((r) => inCourseTab(r, courseTab)),
    [recipes, courseTab],
  );
  const tags = uniqueTags(tabPool);
  const filtered = tabPool
    .filter((r) => matches(r, q, tag, byId))
    .sort((a, b) => a.title.localeCompare(b.title));

  const mainList =
    courseTab === "main"
      ? filtered.filter((r) => recipeSegment(r) === "main")
      : filtered;
  const otherList =
    courseTab === "main"
      ? filtered.filter((r) => recipeSegment(r) === "other")
      : [];

  const listForSideTab = courseTab === "side" ? filtered : [];

  const pickListAria = React.useCallback(
    (r: Recipe, inCart: boolean) => {
      if (inCart) {
        return isShopMenuBuildFlow
          ? `Remove ${r.title} from your pick list`
          : isCookNowPickFlow
            ? `Remove ${r.title} from cook-now selection`
            : `Remove ${r.title} from add-to-menu selection`;
      }
      return isShopMenuBuildFlow
        ? `Add ${r.title} to your pick list`
        : isCookNowPickFlow
          ? `Select ${r.title} for cook now`
          : `Add ${r.title} to your menu selection`;
    },
    [isCookNowPickFlow, isShopMenuBuildFlow],
  );

  const renderRecipeRow = (r: Recipe) => {
    const inAddFlowCart = addFlowSelectedIds.has(r.id);
    const detailPath = recipeDetailPath(
      r.id,
      courseTab === "side",
      inPlanFlow ? searchParams : undefined,
    );

    const titleAndMeta = (
      <>
        <span className="recipe-title-row">
          <span>{r.title}</span>
          {r.type === "reference" ? <span className="badge">Reference</span> : null}
        </span>
        {r.tags && r.tags.length > 0 ? (
          <span className="meta">{r.tags.join(" · ")}</span>
        ) : null}
      </>
    );

    if (!inPlanFlow) {
      return (
        <li key={r.id} className="recipe-row">
          <Link className="recipe-link" to={detailPath}>
            {titleAndMeta}
          </Link>
        </li>
      );
    }

    return (
      <li key={r.id} className="recipe-row recipe-row--add-flow">
        <div className="recipe-link recipe-row-add-card">
          <label className="recipe-row-add-card-pick">
            <input
              type="checkbox"
              className="recipe-row-pick-cb"
              checked={inAddFlowCart}
              onChange={() =>
                inAddFlowCart ? removeFromAddFlowCart(r) : addToAddFlowCart(r)
              }
              aria-label={pickListAria(r, inAddFlowCart)}
            />
            <span className="recipe-row-add-card-text">{titleAndMeta}</span>
          </label>
          <div className="recipe-row-add-card-actions" onClick={(e) => e.stopPropagation()}>
            <Link
              to={detailPath}
              className="recipe-row-view-link"
              aria-label={
                isShopMenuBuildFlow
                  ? `View recipe: ${r.title} (ingredients, steps)`
                  : isCookNowPickFlow
                    ? `View recipe: ${r.title} (ingredients, steps)`
                    : `View recipe: ${r.title}`
              }
            >
              View
            </Link>
          </div>
        </div>
      </li>
    );
  };

  const tabPoolEmpty = tabPool.length === 0;
  const listEmpty =
    courseTab === "main"
      ? mainList.length === 0 && otherList.length === 0
      : listForSideTab.length === 0;

  /** Add-meal-from-planner URL: reorder chrome (tabs before search). */
  const addFlow = inPlanFlow;

  const searchInput = (
    <input
      className="search"
      type="search"
      placeholder="Search titles, ingredients, steps…"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      enterKeyHint="search"
      autoComplete="off"
      autoCorrect="off"
    />
  );

  const courseTabs = (
    <div className="recipe-course-tabs" role="tablist" aria-label="Recipe course">
      <button
        type="button"
        role="tab"
        id="tab-main"
        aria-selected={courseTab === "main"}
        aria-controls="recipe-tab-panel"
        className="recipe-course-tab"
        data-on={courseTab === "main"}
        onClick={() => setCourseTab("main")}
      >
        Mains
      </button>
      <button
        type="button"
        role="tab"
        id="tab-side"
        aria-selected={courseTab === "side"}
        aria-controls="recipe-tab-panel"
        className="recipe-course-tab"
        data-on={courseTab === "side"}
        onClick={() => setCourseTab("side")}
      >
        Sides
      </button>
    </div>
  );

  return (
    <div className={addFlow ? "recipe-list-page recipe-list-page--add-flow" : "recipe-list-page"}>
      <div className="list-header list-header--recipe-toolbar">
        <div className="list-header-actions">
          <Link to="/recipes/new" className="recipe-add-new-btn" aria-label="Add new recipe">
            <span className="recipe-add-new-btn-icon" aria-hidden>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="recipe-add-new-btn-label">Add new</span>
          </Link>
        </div>
      </div>

      {inPlanFlow && planKey ? (
        <div
          className="recipe-add-to-plan-flow-banner"
          role="region"
          aria-label={
            isShopMenuBuildFlow
              ? "Add to shopping list"
              : isCookNowPickFlow
                ? "Pick meals to cook"
                : "Adding to meal plan"
          }
        >
          <div className="recipe-add-to-plan-flow-banner-toolbar">
            <p className="recipe-add-to-plan-flow-banner-title">
              {isShopMenuBuildFlow ? (
                <>
                  <strong>Pick recipes</strong> — on confirm, we add them to this week&apos;s menu and
                  your shopping list
                </>
              ) : isCookNowPickFlow ? (
                <>
                  <strong>Pick to cook</strong> — we&apos;ll add them to this week&apos;s menu, then
                  start the checklist
                </>
              ) : (
                <>
                  Adding for <strong>{planTargetLabel(planKey, searchParams)}</strong>
                </>
              )}
            </p>
            <div className="recipe-add-to-plan-flow-banner-actions">
              <button
                type="button"
                className="recipe-add-to-plan-flow-back"
                onClick={addFlowBack}
                aria-label={
                  isShopMenuBuildFlow
                    ? "Back to shopping list"
                    : isCookNowPickFlow
                      ? "Back to Cooking now"
                      : "Back to meal plan"
                }
              >
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addFlow ? courseTabs : searchInput}
      {addFlow ? searchInput : courseTabs}
      {!tabPoolEmpty && tags.length > 0 ? (
        <div
          className="tag-row"
          role="toolbar"
          aria-label={`Filter ${courseTab === "main" ? "mains" : "sides"} by tag`}
        >
          <button
            type="button"
            className="tag-chip"
            data-on={tag === null}
            onClick={() => setTag(null)}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="tag-chip"
              data-on={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : !tabPoolEmpty ? (
        <p className="muted recipe-tab-tags-empty">No tags in this category.</p>
      ) : null}
      <div
        id="recipe-tab-panel"
        role="tabpanel"
        aria-labelledby={courseTab === "main" ? "tab-main" : "tab-side"}
      >
        {tabPoolEmpty ? (
          <p className="empty">
            No recipes in {courseTab === "main" ? "Mains" : "Sides"} yet.
          </p>
        ) : listEmpty ? (
          <p className="empty">No recipes match your search or filters.</p>
        ) : courseTab === "main" ? (
          <>
            {mainList.length > 0 ? (
              <ul className="recipe-list">{mainList.map(renderRecipeRow)}</ul>
            ) : null}
            {otherList.length > 0 ? (
              <section className="recipe-course-block" aria-label={SEGMENT_LABEL.other}>
                <h2 className="recipe-course-heading">{SEGMENT_LABEL.other}</h2>
                <ul className="recipe-list">{otherList.map(renderRecipeRow)}</ul>
              </section>
            ) : null}
          </>
        ) : (
          <ul className="recipe-list">{listForSideTab.map(renderRecipeRow)}</ul>
        )}
      </div>

      {inPlanFlow && planKey ? (
        <div
          className="recipe-list-cart-bar"
          role="region"
          aria-label={
            isShopMenuBuildFlow
              ? "Add to shopping list"
              : isCookNowPickFlow
                ? "Pick meals to cook"
                : "Add to menu"
          }
        >
          <div className="recipe-list-cart-bar-inner">
            <button
              type="button"
              className="btn-primary btn-cta-wide"
              disabled={addFlowSelectedIds.size === 0}
              onClick={handleCommitAddFlowCart}
            >
              {isShopMenuBuildFlow
                ? addFlowSelectedIds.size === 0
                  ? "Add to shopping list"
                  : `Add (${addFlowSelectedIds.size}) to shopping list`
                : isCookNowPickFlow
                  ? addFlowSelectedIds.size === 0
                    ? "Cook now"
                    : `Cook (${addFlowSelectedIds.size}) now`
                  : addFlowSelectedIds.size === 0
                    ? "Add to menu"
                    : `Add (${addFlowSelectedIds.size}) to menu`}
            </button>
            <button
              type="button"
              className="btn-secondary btn-cta-wide"
              onClick={addFlowBack}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
