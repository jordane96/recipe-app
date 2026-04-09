import * as React from "react";
import { Link } from "react-router-dom";
import {
  buildShoppingListData,
  formatVolumeConversions,
  formatWeightConversions,
  type CombinedShoppingItem,
  type IngredientBreakdown,
} from "./shoppingMerge";
import type { IngredientDef, Recipe } from "./types";
import { recipeDetailPath } from "./listTabSearch";
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

function groupSlotsByRecipeId(
  list: Array<{ recipe: Recipe }>,
): Array<{ recipe: Recipe; count: number }> {
  const order: string[] = [];
  const map = new Map<string, { recipe: Recipe; count: number }>();
  for (const { recipe } of list) {
    if (!map.has(recipe.id)) {
      order.push(recipe.id);
      map.set(recipe.id, { recipe, count: 0 });
    }
    map.get(recipe.id)!.count += 1;
  }
  return order.map((id) => map.get(id)!);
}

function mergeBreakdownsByRecipeId(
  blocks: IngredientBreakdown[],
): Array<IngredientBreakdown & { portionCount: number }> {
  const order: string[] = [];
  const map = new Map<string, IngredientBreakdown & { portionCount: number }>();
  for (const b of blocks) {
    if (!map.has(b.recipeId)) {
      order.push(b.recipeId);
      map.set(b.recipeId, { ...b, portionCount: 0 });
    }
    map.get(b.recipeId)!.portionCount += 1;
  }
  return order.map((id) => map.get(id)!);
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
    removeAllSlotsForRecipe,
    clearList,
    isPurchased,
    togglePurchased,
    clearPurchased,
    prunePurchasedToValidLines,
  } = useShoppingList();

  const selectedSlots = React.useMemo(() => {
    return selectedIds
      .map((id, slotIndex) => {
        const r = recipes.find((x) => x.id === id);
        return r ? { recipe: r, slotIndex, id } : null;
      })
      .filter((x): x is { recipe: Recipe; slotIndex: number; id: string } => x !== null);
  }, [selectedIds, recipes]);

  const selectedRecipes = React.useMemo(
    () => selectedSlots.map((s) => s.recipe),
    [selectedSlots],
  );

  const recipeById = React.useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );

  const selectedBySegment = React.useMemo(() => {
    const slots: Record<
      RecipeSegment,
      Array<{ recipe: Recipe; slotIndex: number }>
    > = { main: [], side: [], other: [] };
    for (const s of selectedSlots) {
      slots[recipeSegment(s.recipe)].push({ recipe: s.recipe, slotIndex: s.slotIndex });
    }
    const grouped: Record<RecipeSegment, Array<{ recipe: Recipe; count: number }>> = {
      main: [],
      side: [],
      other: [],
    };
    for (const seg of SEGMENT_ORDER) {
      grouped[seg] = groupSlotsByRecipeId(slots[seg]);
    }
    return grouped;
  }, [selectedSlots]);

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
          ← Plan
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
                    {list.map(({ recipe: r, count }) => (
                      <li key={r.id} className="selected-recipe-row">
                        <Link
                          to={recipeDetailPath(r.id, recipeSegment(r) === "side")}
                          className="selected-recipe-link"
                        >
                          {r.title}
                          {count > 1 ? (
                            <span className="selected-recipe-count"> × {count}</span>
                          ) : null}
                        </Link>
                        <div className="selected-recipe-actions">
                          {count > 1 ? (
                            <button
                              type="button"
                              className="selected-recipe-qty-btn"
                              aria-label={`Remove one ${r.title} from list`}
                              onClick={() => removeFromList(r.id)}
                            >
                              −
                            </button>
                          ) : null}
                          {count > 1 ? (
                            <button
                              type="button"
                              className="btn-remove"
                              aria-label={`Remove all ${count} ${r.title} from list`}
                              onClick={() => removeAllSlotsForRecipe(r.id)}
                            >
                              Remove all
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-remove"
                              aria-label={`Remove ${r.title} from list`}
                              onClick={() => removeFromList(r.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
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
              const mergedBlocks = mergeBreakdownsByRecipeId(blocks);
              if (mergedBlocks.length === 0) {
                return null;
              }
              return (
                <div key={seg} className="shopping-segment">
                  <h3 className="shopping-segment-heading">{SEGMENT_LABEL[seg]}</h3>
                  {mergedBlocks.map((block) => (
                    <div key={block.recipeId} className="by-recipe-block">
                      <h4 className="by-recipe-title">
                        {block.title}
                        {block.portionCount > 1 ? ` × ${block.portionCount}` : ""}
                      </h4>
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
