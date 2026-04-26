import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  buildShoppingListData,
  combinedLinesContributedByRecipe,
  formatVolumeConversions,
  formatWeightConversions,
  type CombinedShoppingItem,
  type IngredientBreakdown,
} from "./shoppingMerge";
import type { IngredientDef, Recipe } from "./types";
import {
  ADD_TO_PLAN_QUERY,
  recipeDetailPath,
  recipesShopMenuBuildPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { iso, startOfWeekMonday } from "./mealPlanDates";
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

function SelectedRecipePurchasedCheckbox({
  recipeTitle,
  lines,
  isPurchased,
  setPurchasedBatch,
}: {
  recipeTitle: string;
  lines: readonly string[];
  isPurchased: (line: string) => boolean;
  setPurchasedBatch: (lines: string[], purchased: boolean) => void;
}) {
  const n = lines.length;
  const allPurchased = n > 0 && lines.every((l) => isPurchased(l));

  if (n === 0) {
    return null;
  }

  return (
    <input
      type="checkbox"
      className="selected-recipe-check shopping-check-input"
      checked={allPurchased}
      onChange={() => setPurchasedBatch([...lines], !allPurchased)}
      aria-label={
        allPurchased
          ? `Mark ingredients for ${recipeTitle} as not purchased`
          : `Mark all ingredients for ${recipeTitle} as purchased`
      }
    />
  );
}

function segmentSlotTotal(list: Array<{ recipe: Recipe; count: number }>): number {
  return list.reduce((acc, { count }) => acc + count, 0);
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
  const [searchParams] = useSearchParams();
  const weekStartIso = React.useMemo(() => iso(startOfWeekMonday(new Date())), []);
  /** Recipe links carry shop+menu build params so detail uses “add to selection,” not a direct menu add. */
  const planPreserveForRecipeLinks = React.useMemo(() => {
    if (urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY)) != null) {
      return searchParams;
    }
    const href = recipesShopMenuBuildPath(weekStartIso);
    const qi = href.indexOf("?");
    if (qi < 0) {
      return new URLSearchParams();
    }
    return new URLSearchParams(href.slice(qi + 1));
  }, [searchParams, weekStartIso]);
  const shopMenuBuildListHref = React.useMemo(
    () => recipesShopMenuBuildPath(weekStartIso),
    [weekStartIso],
  );

  const {
    selectedIds,
    addToList,
    removeFromList,
    removeAllSlotsForRecipe,
    isPurchased,
    togglePurchased,
    setPurchasedBatch,
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

  return (
    <>
      <header className="shopping-page-head shopping-page-head--with-cta">
        <Link to="/place-order" className="btn-primary shopping-place-order-btn">
          Place order
        </Link>
      </header>

      {selectedRecipes.length === 0 ? (
        <>
          <p className="empty">Your shopping list is empty, browse recipes to add.</p>
          <div className="shopping-list-empty-cta cta-panel">
            <Link
              to={shopMenuBuildListHref}
              className="btn-primary btn-cta-wide"
              aria-label="Browse recipes to add to your shopping list and menu"
            >
              Browse recipes
            </Link>
          </div>
        </>
      ) : null}

      {selectedRecipes.length > 0 ? (
        <>
          <section className="detail-section">
            {SEGMENT_ORDER.map((seg) => {
              const list = selectedBySegment[seg];
              if (list.length === 0) {
                return null;
              }
              const n = segmentSlotTotal(list);
              return (
                <div key={seg} className="shopping-segment">
                  <h3 className="shopping-segment-heading">
                    {SEGMENT_LABEL[seg]}{" "}
                    <span className="shopping-segment-count">({n})</span>
                  </h3>
                  <ul className="selected-recipes">
                    {list.map(({ recipe: r, count }) => {
                      return (
                      <li
                        key={r.id}
                        className="selected-recipe-row selected-recipe-row--slot"
                      >
                        <div className="selected-recipe-row-top">
                          <div className="selected-recipe-check-cell">
                            <SelectedRecipePurchasedCheckbox
                              recipeTitle={r.title}
                              lines={combinedLinesContributedByRecipe(combinedItems, r.id)}
                              isPurchased={isPurchased}
                              setPurchasedBatch={setPurchasedBatch}
                            />
                          </div>
                          <Link
                            to={recipeDetailPath(
                              r.id,
                              recipeSegment(r) === "side",
                              planPreserveForRecipeLinks,
                              true,
                            )}
                            className="selected-recipe-link"
                          >
                            {r.title}
                          </Link>
                          <div
                            className="selected-recipe-qty-stepper"
                            role="group"
                            aria-label={`Shopping list quantity for ${r.title}`}
                          >
                            <button
                              type="button"
                              className="selected-recipe-qty-btn"
                              aria-label={`Remove one ${r.title} from shopping list`}
                              onClick={() => removeFromList(r.id)}
                            >
                              −
                            </button>
                            <span className="selected-recipe-qty-value">{count}</span>
                            <button
                              type="button"
                              className="selected-recipe-qty-btn"
                              aria-label={`Add one ${r.title} to shopping list`}
                              onClick={() => addToList(r.id)}
                            >
                              +
                            </button>
                          </div>
                          <div className="selected-recipe-actions">
                            <button
                              type="button"
                              className="btn-remove"
                              aria-label={`Remove ${r.title} from shopping list (${count} portion${count === 1 ? "" : "s"})`}
                              onClick={() => removeAllSlotsForRecipe(r.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                    })}
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
      ) : null}
    </>
  );
}
