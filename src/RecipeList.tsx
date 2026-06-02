import * as React from "react";
import { Link, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMapWithRecipes } from "./ingredientDisplay";
import {
  ADD_TO_CART_QUERY,
  ADD_TO_PLAN_QUERY,
  COOK_ON_ADD_QUERY,
  COOK_ON_ADD_VALUE,
  FROM_QUERY,
  PLAN_WEEK_START_QUERY,
  SHOP_MENU_BUILD_QUERY,
  readRecipeListPickExperience,
  recipeCookModePath,
  recipeDetailPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { useShoppingList } from "./ShoppingListContext";
import {
  loadRecipeListFilters,
  loadRecipeListScrollY,
  saveRecipeListFilters,
  saveRecipeListScrollY,
} from "./recipeListPersistence";
import { getPreviousPathname, isRecipeDetailPathname } from "./navHistory";
import { iso } from "./mealPlanDates";
import { instructionStepText } from "./recipeInstructions";
import {
  isMealPlanDateKey,
  MEAL_PLAN_UNASSIGNED_KEY,
  newPlanSlotRef,
  type PlannedMeal,
} from "./mealPlanStorage";
import { addCookProgressSessionsBatch } from "./cookProgressSession";
import { recipeToPlannedMeal, useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";
import { useSavedRecipes } from "./SavedRecipesContext";
import { addFlowCartSessionKey, setActiveAddFlowSessionKey } from "./addFlowCartSession";

/** "main" and "side" are pinned to the front of the chip row; the rest sort alphabetically. */
const PINNED_TAG_ORDER = ["main", "side"];

function uniqueTags(recipes: Recipe[]): string[] {
  const s = new Set<string>();
  for (const r of recipes) {
    for (const t of r.tags ?? []) {
      s.add(t);
    }
  }
  const pinned = PINNED_TAG_ORDER.filter((t) => s.has(t));
  const rest = [...s]
    .filter((t) => !PINNED_TAG_ORDER.includes(t))
    .sort((a, b) => a.localeCompare(b));
  return [...pinned, ...rest];
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
  selectedTags: ReadonlySet<string>,
  byId: Map<string, IngredientDef>,
): boolean {
  if (selectedTags.size > 0) {
    const recipeTags = recipe.tags ?? [];
    for (const t of selectedTags) {
      if (!recipeTags.includes(t)) {
        return false;
      }
    }
  }
  if (!q.trim()) {
    return true;
  }
  const needle = q.trim().toLowerCase();
  if (recipe.title.toLowerCase().includes(needle)) {
    return true;
  }
  if ((recipe.description ?? "").toLowerCase().includes(needle)) {
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
  currentUser,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  currentUser: string;
}) {
  const { addPlannedMealsToKey } = useMealPlan();
  const { savedRecipeIds } = useSavedRecipes();
  // My recipes view: own + saved. Drops other users' public recipes (those
  // are surfaced in /recipes/discover).
  const myRecipes = React.useMemo(
    () =>
      recipes.filter((r) => r.owner === currentUser || savedRecipeIds.has(r.id)),
    [recipes, currentUser, savedRecipeIds],
  );
  const recipeById = React.useMemo(
    () => new Map<string, Recipe>(myRecipes.map((r) => [r.id, r])),
    [myRecipes],
  );
  const { showToast } = useToast();
  const { addToList } = useShoppingList();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  // Include each recipe's customIngredientDefs so custom-* ingredient ids render their human
  // names instead of leaking the raw id (e.g. "custom-spinach" → "Spinach").
  const byId = React.useMemo(
    () => ingredientMapWithRecipes(ingredients, recipes),
    [ingredients, recipes],
  );
  // Hydrate filter state from sessionStorage so list state survives detail-page round-trips.
  const persistedFiltersRef = React.useRef(loadRecipeListFilters());
  const [q, setQ] = React.useState(persistedFiltersRef.current.q);
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(
    () => new Set(persistedFiltersRef.current.selectedTags),
  );
  const [filtersOpen, setFiltersOpen] = React.useState(persistedFiltersRef.current.filtersOpen);

  // Forward nav to /recipes (e.g. tapping the "Recipes" tab) should start fresh — clear any search
  // and tag filters left over from a previous visit. Back-nav (POP) from a recipe detail keeps them
  // so list↔detail round-trips feel continuous. Layout effect so the stale query never paints.
  React.useLayoutEffect(() => {
    // Returning from a recipe detail (an in-app "Back" <Link>, i.e. a PUSH) must preserve the
    // search/filters so the list looks the same as when you left it. Only a genuine fresh visit
    // from another tab clears them.
    const returningFromDetail = isRecipeDetailPathname(getPreviousPathname());
    if (navigationType === "PUSH" && !returningFromDetail) {
      setQ("");
      setSelectedTags(new Set());
      setFiltersOpen(false);
    }
    // Mount-only: navigationType is stable for this RecipeList instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filter state on every change. Lightweight (one sessionStorage write per change).
  React.useEffect(() => {
    saveRecipeListFilters({
      q,
      selectedTags: [...selectedTags],
      filtersOpen,
    });
  }, [q, selectedTags, filtersOpen]);

  // Restore scroll when returning to the list from a recipe. Two ways back qualify:
  //  - browser Back (POP), and
  //  - the detail page's in-app "Back" <Link>, which is a PUSH whose previous path is the detail.
  // A fresh visit from another tab (previous path is some other route) intentionally stays at top.
  // App.tsx skips its snap-to-top for both of these so this restore isn't overridden.
  React.useLayoutEffect(() => {
    const returningFromDetail = isRecipeDetailPathname(getPreviousPathname());
    if (navigationType !== "POP" && !returningFromDetail) {
      return;
    }
    const y = loadRecipeListScrollY();
    if (y == null) {
      return;
    }
    // Immediate restore (list renders synchronously, so layout height is already correct), with a
    // 2x rAF backstop in case mobile URL-bar collapse shifts layout after the first paint.
    window.scrollTo(0, y);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
    // Mount-only: navigationType is stable across the lifetime of this RecipeList instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the scroll position when leaving the list for a recipe, captured synchronously on the
  // link click while the DOM is still intact. (Saving in an unmount cleanup is too late — the long
  // list has already been replaced by the short detail page, so the browser has clamped scrollY
  // back toward 0.) The matching restore runs when returning to the list from a detail.
  const rememberScrollOnLeave = React.useCallback(() => {
    saveRecipeListScrollY(window.scrollY);
  }, []);

  const toggleTag = React.useCallback((t: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }, []);
  const clearTags = React.useCallback(() => setSelectedTags(new Set()), []);
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

  React.useEffect(() => {
    const raw = searchParams.get(ADD_TO_PLAN_QUERY);
    if (raw && urlParamToPlanKey(raw) == null) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete(ADD_TO_PLAN_QUERY);
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
    // Planning onto a calendar day should also surface the meal on the menu so it can be cooked
    // from there. These are independent copies (their own slot refs) — editing/cooking one doesn't
    // affect the other; the calendar copy is pruned if its day passes uncooked.
    if (planKey !== MEAL_PLAN_UNASSIGNED_KEY && isMealPlanDateKey(planKey)) {
      addPlannedMealsToKey(
        MEAL_PLAN_UNASSIGNED_KEY,
        baseEntries.map((e) => ({ ...e })),
      );
    }
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

  const tags = React.useMemo(() => uniqueTags(myRecipes), [myRecipes]);
  const filtered = React.useMemo(
    () =>
      myRecipes
        .filter((r) => matches(r, q, selectedTags, byId))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [myRecipes, q, selectedTags, byId],
  );

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
      inPlanFlow ? searchParams : undefined,
    );

    const titleAndMeta = (
      <span className="recipe-title-row">
        <span>{r.title}</span>
        {r.type === "reference" ? <span className="badge">Reference</span> : null}
      </span>
    );

    if (!inPlanFlow) {
      return (
        <li key={r.id} className="recipe-row">
          <Link className="recipe-link" to={detailPath} onClick={rememberScrollOnLeave}>
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
              onClick={rememberScrollOnLeave}
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

  const recipesEmpty = myRecipes.length === 0;
  const listEmpty = filtered.length === 0;

  const addFlow = inPlanFlow;

  const searchInput = (
    <div className="search-wrap">
      <input
        className="search search--with-clear"
        type="search"
        placeholder="Search titles, ingredients, steps…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
      />
      {q ? (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={() => setQ("")}
        >
          ×
        </button>
      ) : null}
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
          <Link to="/recipes/discover" className="recipe-add-new-btn" aria-label="Discover recipes">
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
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <span className="recipe-add-new-btn-label">Discover</span>
          </Link>
        </div>
      </div>

      {searchInput}
      {!recipesEmpty && tags.length > 0 ? (
        <>
          <button
            type="button"
            className="recipe-filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="recipe-filters-row"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <span>
              Filters
              {selectedTags.size > 0
                ? `: ${[...selectedTags].sort((a, b) => a.localeCompare(b)).join(", ")}`
                : ""}
            </span>
            <span className="recipe-filters-toggle-caret" aria-hidden>
              {filtersOpen ? "▾" : "▸"}
            </span>
          </button>
          {filtersOpen ? (
            <div
              id="recipe-filters-row"
              className="tag-row"
              role="toolbar"
              aria-label="Filter recipes by tag"
            >
              <button
                type="button"
                className="tag-chip"
                data-on={selectedTags.size === 0}
                onClick={clearTags}
              >
                All
              </button>
              {tags.map((t) => {
                const on = selectedTags.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className="tag-chip"
                    data-on={on}
                    aria-pressed={on}
                    onClick={() => toggleTag(t)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
      <div id="recipe-tab-panel">
        {recipesEmpty ? (
          <p className="empty">No recipes yet.</p>
        ) : listEmpty ? (
          <p className="empty">No recipes match your search or filters.</p>
        ) : (
          <ul className="recipe-list">{filtered.map(renderRecipeRow)}</ul>
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
