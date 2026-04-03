import * as React from "react";
import { Link } from "react-router-dom";
import {
  buildShoppingListData,
  formatVolumeConversions,
  formatWeightConversions,
  type CombinedShoppingItem,
} from "./shoppingMerge";
import type { IngredientDef, Recipe } from "./types";
import {
  recipeSegment,
  SEGMENT_LABEL,
  SEGMENT_ORDER,
  segmentRank,
  type RecipeSegment,
} from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";

function altConversionsForItem(item: CombinedShoppingItem): string | null {
  if (item.kind === "volume") {
    const s = formatVolumeConversions(item.tsp, item.volumeTier);
    return s || null;
  }
  if (item.kind === "weight") {
    const s = formatWeightConversions(item.oz, item.weightTier);
    return s || null;
  }
  return null;
}

export function ShoppingListPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const {
    selectedIds,
    removeFromList,
    clearList,
    isPurchased,
    togglePurchased,
    clearPurchased,
    prunePurchasedToValidLines,
  } = useShoppingList();

  const selectedRecipes = selectedIds
    .map((id) => recipes.find((r) => r.id === id))
    .filter((r): r is Recipe => Boolean(r));

  const recipeById = React.useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );

  const selectedBySegment = React.useMemo(() => {
    const out: Record<RecipeSegment, Recipe[]> = { main: [], side: [], other: [] };
    for (const r of selectedRecipes) {
      out[recipeSegment(r)].push(r);
    }
    return out;
  }, [selectedRecipes]);

  const { combinedItems, byRecipe } = buildShoppingListData(
    selectedRecipes,
    ingredients,
  );

  const combinedLines = React.useMemo(
    () => combinedItems.map((i) => i.line),
    [combinedItems],
  );

  React.useEffect(() => {
    prunePurchasedToValidLines(combinedLines);
  }, [combinedLines, prunePurchasedToValidLines]);

  const sortedByRecipe = React.useMemo(() => {
    return [...byRecipe].sort((a, b) => {
      const ra = recipeById.get(a.recipeId);
      const rb = recipeById.get(b.recipeId);
      const sa = ra ? recipeSegment(ra) : "main";
      const sb = rb ? recipeSegment(rb) : "main";
      const dr = segmentRank(sa) - segmentRank(sb);
      if (dr !== 0) {
        return dr;
      }
      return a.title.localeCompare(b.title);
    });
  }, [byRecipe, recipeById]);

  const copyText = React.useMemo(() => {
    const header = "Shopping list";
    const lines = combinedItems.map((item) => {
      const alt = altConversionsForItem(item);
      const text = alt ? `${item.line} (${alt})` : item.line;
      return `• ${text}`;
    });
    return [header, "", ...lines].join("\n");
  }, [combinedItems]);

  const [copyDone, setCopyDone] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="top-bar">
        <Link to="/" className="back-btn">
          ← Recipes
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Shopping list
        </h1>
      </div>

      {selectedRecipes.length === 0 ? (
        <p className="empty">
          No recipes on your list yet. Open a recipe and tap{" "}
          <strong>Add to shopping list</strong>, or use <strong>+</strong> on the
          recipe list.
        </p>
      ) : (
        <>
          <div className="shopping-toolbar">
            <button type="button" className="btn-secondary" onClick={handleCopy}>
              {copyDone ? "Copied" : "Copy combined list"}
            </button>
            <button type="button" className="btn-ghost" onClick={clearPurchased}>
              Reset purchased
            </button>
            <button type="button" className="btn-ghost" onClick={clearList}>
              Clear recipes
            </button>
          </div>

          <section className="detail-section">
            <h2>Selected recipes ({selectedRecipes.length})</h2>
            {SEGMENT_ORDER.map((seg) => {
              const list = selectedBySegment[seg];
              if (list.length === 0) {
                return null;
              }
              return (
                <div key={seg} className="shopping-segment">
                  <h3 className="shopping-segment-heading">{SEGMENT_LABEL[seg]}</h3>
                  <ul className="selected-recipes">
                    {list.map((r) => (
                      <li key={r.id} className="selected-recipe-row">
                        <Link to={`/recipe/${r.id}`} className="selected-recipe-link">
                          {r.title}
                        </Link>
                        <button
                          type="button"
                          className="btn-remove"
                          aria-label={`Remove ${r.title} from list`}
                          onClick={() => removeFromList(r.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className="detail-section">
            <h2>Combined list</h2>
            {combinedItems.length === 0 ? (
              <p className="muted">
                No mergeable ingredient rows in the selected recipes (empty or
                qualitative only).
              </p>
            ) : (
              <ul className="shopping-combined shopping-checklist">
                {combinedItems.map((item, i) => {
                  const line = item.line;
                  const bought = isPurchased(line);
                  const alt = altConversionsForItem(item);
                  const visibleLabel = alt ? `${line} (${alt})` : line;
                  return (
                    <li key={`${line}-${i}`}>
                      <label
                        className={`shopping-check-row${bought ? " shopping-check-row--bought" : ""}`}
                      >
                        <input
                          type="checkbox"
                          className="shopping-check-input"
                          checked={bought}
                          onChange={() => togglePurchased(line)}
                          aria-label={`Purchased: ${visibleLabel}`}
                        />
                        <span className="shopping-check-label">
                          <span className="shopping-check-primary">{line}</span>
                          {alt ? (
                            <span className="shopping-inline-alt"> ({alt})</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="detail-section">
            <h2>By recipe</h2>
            {SEGMENT_ORDER.map((seg) => {
              const blocks = sortedByRecipe.filter((b) => {
                const r = recipeById.get(b.recipeId);
                return (r ? recipeSegment(r) : "main") === seg;
              });
              if (blocks.length === 0) {
                return null;
              }
              return (
                <div key={seg} className="shopping-segment">
                  <h3 className="shopping-segment-heading">{SEGMENT_LABEL[seg]}</h3>
                  {blocks.map((block) => (
                    <div key={block.recipeId} className="by-recipe-block">
                      <h4 className="by-recipe-title">{block.title}</h4>
                      {block.items.length === 0 ? (
                        <p className="muted">No ingredient lines in data.</p>
                      ) : (
                        <ul>
                          {block.items.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
