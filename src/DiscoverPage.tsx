import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import { instructionStepText } from "./recipeInstructions";
import { useToast } from "./ToastContext";
import { useSavedRecipes } from "./SavedRecipesContext";
import { recipeDetailPath } from "./listTabSearch";

/** "main" and "side" pinned to the front of the chip row, like the Recipes list. */
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

function matches(
  recipe: Recipe,
  q: string,
  selectedTags: ReadonlySet<string>,
  byId: Map<string, IngredientDef>,
): boolean {
  if (selectedTags.size > 0) {
    const recipeTags = recipe.tags ?? [];
    for (const t of selectedTags) {
      if (!recipeTags.includes(t)) return false;
    }
  }
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  if (recipe.title.toLowerCase().includes(needle)) return true;
  if ((recipe.description ?? "").toLowerCase().includes(needle)) return true;
  for (const sec of recipe.ingredientSections ?? []) {
    if (sec.name.toLowerCase().includes(needle)) return true;
    for (const line of sec.lines) {
      const def = byId.get(line.ingredientId);
      if (def?.name.toLowerCase().includes(needle)) return true;
      if (formatIngredientLine(line, byId).toLowerCase().includes(needle)) return true;
    }
  }
  for (const line of recipe.instructions ?? []) {
    if (instructionStepText(line).toLowerCase().includes(needle)) return true;
  }
  return false;
}

export function DiscoverPage({
  recipes,
  ingredients,
  currentUser,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  currentUser: string;
}) {
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const { savedRecipeIds, saveRecipe } = useSavedRecipes();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [q, setQ] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(() => new Set());
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const toggleTag = React.useCallback((t: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);
  const clearTags = React.useCallback(() => setSelectedTags(new Set()), []);

  // Discover pool: public recipes from other users that the current user hasn't saved.
  const discoverable = React.useMemo(
    () =>
      recipes.filter(
        (r) =>
          r.visibility !== "private" &&
          r.owner !== currentUser &&
          !savedRecipeIds.has(r.id),
      ),
    [recipes, currentUser, savedRecipeIds],
  );

  const tags = React.useMemo(() => uniqueTags(discoverable), [discoverable]);
  const filtered = React.useMemo(
    () =>
      discoverable
        .filter((r) => matches(r, q, selectedTags, byId))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [discoverable, q, selectedTags, byId],
  );

  const handleSave = React.useCallback(
    async (r: Recipe) => {
      try {
        await saveRecipe(r.id);
        showToast("Recipe saved!");
      } catch {
        showToast("Couldn't save — please try again.");
      }
    },
    [saveRecipe, showToast],
  );

  const recipesEmpty = discoverable.length === 0;
  const listEmpty = filtered.length === 0;

  return (
    <div className="recipe-list-page recipe-list-page--with-bottom-bar">
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
      {!recipesEmpty && tags.length > 0 ? (
        <>
          <button
            type="button"
            className="recipe-filters-toggle"
            aria-expanded={filtersOpen}
            aria-controls="discover-filters-row"
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
              id="discover-filters-row"
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
      <div>
        {recipesEmpty ? (
          <p className="empty">No new recipes to discover.</p>
        ) : listEmpty ? (
          <p className="empty">No recipes match your search or filters.</p>
        ) : (
          <ul className="recipe-list">
            {filtered.map((r) => (
              <li key={r.id} className="recipe-row discover-row">
                <Link
                  className="recipe-link discover-row-link"
                  to={recipeDetailPath(r.id, undefined, false, false, false, undefined, true)}
                >
                  <span className="recipe-title-row">
                    <span>{r.title}</span>
                  </span>
                  {r.owner ? (
                    <span className="meta">by {r.owner}</span>
                  ) : null}
                </Link>
                <button
                  type="button"
                  className="discover-save-btn"
                  aria-label={`Save ${r.title}`}
                  onClick={() => handleSave(r)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="discover-save-btn-label">Save</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="recipe-list-cart-bar"
        role="region"
        aria-label="Discover navigation"
      >
        <div className="recipe-list-cart-bar-inner">
          <button
            type="button"
            className="btn-secondary btn-cta-wide"
            onClick={() => navigate("/recipes")}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
