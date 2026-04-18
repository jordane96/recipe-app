import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  LIST_TAB_QUERY,
  LIST_TAB_SIDE_VALUE,
  PLAN_PHASE_MAIN,
  PLAN_PHASE_QUERY,
  PLAN_PHASE_SIDE,
  PLAN_WEEK_START_QUERY,
  readPlanPhaseSide,
  readSidesListTab,
  recipeDetailPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { weekRangeLabel } from "./mealPlanDates";
import { recipeSegment, SEGMENT_LABEL } from "./recipeCourse";
import { isMealPlanDateKey, MEAL_PLAN_UNASSIGNED_KEY } from "./mealPlanStorage";
import { useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";

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
    if (line.toLowerCase().includes(needle)) {
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
  const { addRecipeToPlanKey } = useMealPlan();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);

  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;

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
          return p;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

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

  const handleAddToPlan = React.useCallback(
    (r: Recipe) => {
      addRecipeToPlanKey(planKey ?? MEAL_PLAN_UNASSIGNED_KEY, r);
      showToast(`Added “${r.title}” to your meal plan.`);
    },
    [planKey, addRecipeToPlanKey, showToast],
  );

  const renderRecipeRow = (r: Recipe) => {
    return (
      <li key={r.id} className="recipe-row">
        <Link
          className="recipe-link"
          to={recipeDetailPath(r.id, courseTab === "side", inPlanFlow ? searchParams : undefined)}
        >
          <span className="recipe-title-row">
            <span>{r.title}</span>
            {r.type === "reference" ? <span className="badge">Reference</span> : null}
          </span>
          {r.tags && r.tags.length > 0 ? (
            <span className="meta">{r.tags.join(" · ")}</span>
          ) : null}
        </Link>
        <button
          type="button"
          className="recipe-add-to-plan-btn"
          aria-label={`Add ${r.title} to meal plan`}
          onClick={() => handleAddToPlan(r)}
        >
          Add to plan
        </button>
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
          <Link
            to="/recipes/new"
            className="recipe-add-new-btn"
            aria-label="Add new recipe"
          >
            <span className="recipe-add-new-btn-plus" aria-hidden>
              +
            </span>
            <span className="recipe-add-new-btn-text" aria-hidden>
              New recipe
            </span>
          </Link>
        </div>
      </div>

      {inPlanFlow && planKey ? (
        <div className="recipe-add-to-plan-flow-banner" role="region" aria-label="Adding to meal plan">
          <div className="recipe-add-to-plan-flow-banner-toolbar">
            <p className="recipe-add-to-plan-flow-banner-title">
              Adding for <strong>{planTargetLabel(planKey, searchParams)}</strong>
            </p>
            <div className="recipe-add-to-plan-flow-banner-actions">
              <button
                type="button"
                className="recipe-add-to-plan-flow-back"
                onClick={() => navigate("/")}
                aria-label="Back to meal plan"
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

    </div>
  );
}
