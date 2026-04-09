import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  LIST_TAB_QUERY,
  LIST_TAB_SIDE_VALUE,
  readSidesListTab,
  recipeDetailPath,
  shoppingListPath,
} from "./listTabSearch";
import { recipeSegment, SEGMENT_LABEL, type RecipeSegment } from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";

/** Which top-level tab is active on the recipe list (reference items show under Mains). */
type CourseTab = "main" | "side";

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
  const { addToList, removeFromList, listQuantity, count } = useShoppingList();
  const [searchParams, setSearchParams] = useSearchParams();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);

  const courseTab: CourseTab = readSidesListTab(searchParams) ? "side" : "main";
  const setCourseTab = React.useCallback(
    (tab: CourseTab) => {
      if (tab === "side") {
        setSearchParams({ [LIST_TAB_QUERY]: LIST_TAB_SIDE_VALUE }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  React.useEffect(() => {
    setTag(null);
  }, [courseTab]);

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

  const renderRecipeRow = (r: Recipe) => {
    const qty = listQuantity(r.id);
    return (
      <li key={r.id} className="recipe-row">
        <Link
          className="recipe-link"
          to={recipeDetailPath(r.id, courseTab === "side")}
        >
          <span className="recipe-title-row">
            <span>{r.title}</span>
            {r.type === "reference" ? <span className="badge">Reference</span> : null}
          </span>
          {r.tags && r.tags.length > 0 ? (
            <span className="meta">{r.tags.join(" · ")}</span>
          ) : null}
        </Link>
        <div className="recipe-list-qty" role="group" aria-label={`Shopping list quantity for ${r.title}`}>
          {qty > 0 ? (
            <button
              type="button"
              className="recipe-list-qty-btn"
              aria-label={`Remove one ${r.title} from shopping list`}
              onClick={() => removeFromList(r.id)}
            >
              −
            </button>
          ) : null}
          {qty > 0 ? <span className="recipe-list-qty-n">{qty}×</span> : null}
          <button
            type="button"
            className={qty > 0 ? "recipe-list-toggle recipe-list-toggle--add" : "recipe-list-toggle"}
            aria-label={
              qty > 0
                ? `Add another ${r.title} to shopping list`
                : `Add ${r.title} to shopping list`
            }
            onClick={() => addToList(r.id)}
          >
            +
          </button>
        </div>
      </li>
    );
  };

  const tabPoolEmpty = tabPool.length === 0;
  const listEmpty =
    courseTab === "main"
      ? mainList.length === 0 && otherList.length === 0
      : listForSideTab.length === 0;

  return (
    <>
      <div className="list-header">
        <h1 className="page-title list-title">Recipes</h1>
        <div className="list-header-actions">
          <Link to="/" className="list-header-link">
            Plan
          </Link>
          <Link to={shoppingListPath(courseTab === "side")} className="shopping-pill">
            List{count > 0 ? ` (${count})` : ""}
          </Link>
        </div>
      </div>
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
      <div
        className="recipe-course-tabs"
        role="tablist"
        aria-label="Recipe course"
      >
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
    </>
  );
}
