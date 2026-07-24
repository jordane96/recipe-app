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
import {
  type IngredientCategory,
  type IngredientDef,
  type Recipe,
  grocerySectionLabel,
  INGREDIENT_CATEGORY_ORDER,
} from "./types";
import {
  ADD_TO_PLAN_QUERY,
  recipeDetailPath,
  recipesAddItemsFromShoppingPath,
  recipesShopMenuBuildPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { iso, startOfWeekMonday } from "./mealPlanDates";
import { recipeSegment, segmentRank } from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";
import { useToast } from "./ToastContext";

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
  const addItemsFromShoppingHref = React.useMemo(
    () => recipesAddItemsFromShoppingPath(searchParams, weekStartIso),
    [searchParams, weekStartIso],
  );

  const {
    selectedIds,
    removeAllSlotsForRecipe,
    isPurchased,
    togglePurchased,
    setPurchasedBatch,
    prunePurchasedToValidLines,
    additionalItems,
    addAdditionalItem,
    removeAdditionalItem,
    servingsByRecipe,
    setRecipeServings,
    clearList,
  } = useShoppingList();
  const { showToast } = useToast();

  /** Recipe's base servings (canonical) or null when unset (legacy recipes). */
  const baseServingsOf = React.useCallback((r: Recipe): number | null => {
    return typeof r.servings === "number" && r.servings > 0 ? r.servings : null;
  }, []);

  /** Effective shopping-list servings for a recipe: override → base → 1. */
  const servingsFor = React.useCallback(
    (r: Recipe): number => {
      const override = servingsByRecipe[r.id];
      if (typeof override === "number" && override > 0) return override;
      return baseServingsOf(r) ?? 1;
    },
    [servingsByRecipe, baseServingsOf],
  );

  /** Ingredient scale multiple: servings ÷ base. 1 when the recipe has no base servings. */
  const scaleFor = React.useCallback(
    (r: Recipe): number => {
      const base = baseServingsOf(r);
      return base == null ? 1 : servingsFor(r) / base;
    },
    [baseServingsOf, servingsFor],
  );

  /** Toggle + toast wrapper. Only toasts on the unpurchased → purchased transition. */
  const togglePurchasedWithToast = React.useCallback(
    (line: string) => {
      const wasPurchased = isPurchased(line);
      togglePurchased(line);
      if (!wasPurchased) {
        showToast(`Moved “${line}” to Purchased`);
      }
    },
    [isPurchased, togglePurchased, showToast],
  );

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

  // Flat, ungrouped list of selected recipes (deduplicated; count = portion total). The
  // top-of-page recipe list no longer separates mains/sides — one list is friendlier on
  // mobile and the meal nature is already implied by the recipe title.
  const groupedSelected = React.useMemo(
    () => groupSlotsByRecipeId(selectedSlots),
    [selectedSlots],
  );

  // One entry per distinct recipe (deduped), each scaled by its shopping-list servings.
  const shoppingEntries = React.useMemo(
    () => groupedSelected.map(({ recipe }) => ({ recipe, scale: scaleFor(recipe) })),
    [groupedSelected, scaleFor],
  );

  const { combinedItems, byRecipe } = buildShoppingListData(
    shoppingEntries,
    ingredients,
  );

  // Category sections show only NOT-yet-purchased items; checked items move to the
  // dedicated "Purchased" section at the bottom of the page.
  const combinedByCategory = React.useMemo(() => {
    const m = new Map<IngredientCategory, CombinedShoppingItem[]>();
    for (const it of combinedItems) {
      if (isPurchased(it.line)) continue;
      const list = m.get(it.category) ?? [];
      list.push(it);
      m.set(it.category, list);
    }
    return m;
  }, [combinedItems, isPurchased]);

  // Flat alphabetical list of purchased items (no category grouping per the spec).
  const purchasedItems = React.useMemo(
    () =>
      combinedItems
        .filter((it) => isPurchased(it.line))
        .slice()
        .sort((a, b) => a.line.localeCompare(b.line)),
    [combinedItems, isPurchased],
  );

  const combinedLines = React.useMemo(
    () => combinedItems.map((i) => i.line),
    [combinedItems],
  );

  React.useEffect(() => {
    // Include free-text additional items so their purchased marks survive the prune sweep.
    prunePurchasedToValidLines([...combinedLines, ...additionalItems]);
  }, [combinedLines, additionalItems, prunePurchasedToValidLines]);

  // Free-text items split by whether they've been checked off (checked → Purchased section).
  const unpurchasedAdditional = React.useMemo(
    () => additionalItems.filter((t) => !isPurchased(t)),
    [additionalItems, isPurchased],
  );
  const purchasedAdditional = React.useMemo(
    () => additionalItems.filter((t) => isPurchased(t)),
    [additionalItems, isPurchased],
  );

  const [additionalInput, setAdditionalInput] = React.useState("");
  const additionalInputRef = React.useRef<HTMLInputElement>(null);
  const submitAdditional = React.useCallback(() => {
    const t = additionalInput.trim();
    if (!t) return;
    addAdditionalItem(t);
    setAdditionalInput("");
    // Keep focus on the field so the mobile keyboard stays open and the page doesn't scroll
    // away after each add. preventScroll stops the browser re-scrolling the input into view.
    // Runs inside the submit gesture, so iOS keeps the keyboard up.
    additionalInputRef.current?.focus({ preventScroll: true });
  }, [additionalInput, addAdditionalItem]);

  // Reusable JSX for the Additional items section so we can mount it in both the empty
  // state (so users can capture non-recipe items without first selecting a recipe) and the
  // populated state. The heading differs between the two: in the empty state the section
  // is the primary affordance, so it's labeled "Build your own list" instead of the
  // catalog-style "Additional items".
  // Entry box for free-text "additional items": heading + input. Mounted near the top so it's the
  // primary capture affordance; the added items render separately via renderAdditionalItemsList.
  const renderAdditionalItemsEntry = (heading: string) => (
    <section className="detail-section">
      <h2>{heading}</h2>
      <form
        className="shopping-additional-input"
        onSubmit={(e) => {
          e.preventDefault();
          submitAdditional();
        }}
      >
        <input
          ref={additionalInputRef}
          type="text"
          className="shopping-additional-input-field"
          placeholder="Add anything — e.g. coffee filters"
          value={additionalInput}
          onChange={(e) => setAdditionalInput(e.target.value)}
          aria-label="Add an additional item to the shopping list"
        />
        <button
          type="submit"
          className="btn-primary btn-compact"
          disabled={additionalInput.trim().length === 0}
        >
          Add
        </button>
      </form>
    </section>
  );

  // The added free-text items, shown in their own section below the entry box.
  const renderAdditionalItemsList = () =>
    unpurchasedAdditional.length > 0 ? (
      <section className="detail-section">
        <h3 className="shopping-grocery-section-heading">
          Additional items
          <span className="shopping-segment-count"> ({unpurchasedAdditional.length})</span>
        </h3>
        <ul className="shopping-combined shopping-checklist">
          {unpurchasedAdditional.map((text) => (
            <li key={`additional-${text}`}>
              <label className="shopping-check-row">
                <input
                  type="checkbox"
                  className="shopping-check-input"
                  checked={false}
                  onChange={() => togglePurchasedWithToast(text)}
                  aria-label={`Purchased: ${text}`}
                />
                <span className="shopping-check-label">
                  <span className="shopping-check-primary">{text}</span>
                </span>
                <button
                  type="button"
                  className="shopping-additional-remove"
                  aria-label={`Remove ${text} from additional items`}
                  onClick={(e) => {
                    e.preventDefault();
                    removeAdditionalItem(text);
                  }}
                >
                  ×
                </button>
              </label>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  // Purchased section, also reusable across empty and populated states. Combines
  // recipe-derived purchased items and free-text purchased items.
  const purchasedSection =
    (purchasedItems.length + purchasedAdditional.length) > 0 ? (
      <section className="detail-section">
        <h2>
          Purchased
          <span className="shopping-segment-count">
            {" "}
            ({purchasedItems.length + purchasedAdditional.length})
          </span>
        </h2>
        <ul className="shopping-combined shopping-checklist">
          {purchasedItems.map((item, i) => {
            const line = item.line;
            const alt = altConversionsForItem(item);
            const visibleLabel = alt ? `${line} (${alt})` : line;
            return (
              <li key={`purchased-${line}-${i}`}>
                <label className="shopping-check-row shopping-check-row--bought">
                  <input
                    type="checkbox"
                    className="shopping-check-input"
                    checked
                    onChange={() => togglePurchased(line)}
                    aria-label={`Restore to list: ${visibleLabel}`}
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
          {purchasedAdditional.map((text) => (
            <li key={`purchased-additional-${text}`}>
              <label className="shopping-check-row shopping-check-row--bought">
                <input
                  type="checkbox"
                  className="shopping-check-input"
                  checked
                  onChange={() => togglePurchased(text)}
                  aria-label={`Restore to additional items: ${text}`}
                />
                <span className="shopping-check-label">
                  <span className="shopping-check-primary">{text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

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

  // Place order / Clear list — shown whenever the list has anything (recipes OR free-text items).
  const orderActions = (
    <div
      className="shopping-meal-list-actions"
      role="region"
      aria-label="Place order or clear the shopping list"
    >
      <Link to="/place-order" className="btn-primary btn-compact">
        Place order
      </Link>
      <button
        type="button"
        className="btn-secondary btn-compact shopping-clear-list-btn"
        aria-label="Clear the entire shopping list"
        onClick={() => {
          clearList();
          showToast("Shopping list cleared.");
        }}
      >
        Clear list
      </button>
    </div>
  );

  return (
    <>
      {selectedRecipes.length === 0 ? (
        <>
          {additionalItems.length === 0 ? (
            <>
              <p className="empty">
                Your shopping list is empty. Add recipes to build your list, or add items below.
              </p>
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
          ) : (
            <div className="shopping-add-more-row">
              <Link
                to={shopMenuBuildListHref}
                className="btn-secondary btn-compact shopping-add-more-recipes"
                aria-label="Browse recipes to add to your shopping list"
              >
                Add recipes
              </Link>
            </div>
          )}
          {/* Free-text capture works even before any recipes are selected. */}
          {renderAdditionalItemsEntry(
            additionalItems.length === 0 ? "Build your own list" : "Add something else",
          )}
          {/* Allow ordering / clearing a list made of only free-text items. */}
          {additionalItems.length > 0 ? orderActions : null}
          {renderAdditionalItemsList()}
          {purchasedSection}
        </>
      ) : null}

      {selectedRecipes.length > 0 ? (
        <>
          <section className="detail-section">
            <h2>Recipes (# of servings)</h2>
            <ul className="selected-recipes">
              {groupedSelected.map(({ recipe: r }) => (
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
                        planPreserveForRecipeLinks,
                        false,
                        false,
                        true,
                      )}
                      className="selected-recipe-link"
                    >
                      {r.title}
                    </Link>
                    <div
                      className="selected-recipe-qty-stepper"
                      role="group"
                      aria-label={`Servings for ${r.title}`}
                    >
                      <button
                        type="button"
                        className="selected-recipe-qty-btn"
                        aria-label={`Decrease servings for ${r.title}`}
                        onClick={() => setRecipeServings(r.id, servingsFor(r) - 1)}
                      >
                        −
                      </button>
                      <span className="selected-recipe-qty-value">{servingsFor(r)}</span>
                      <button
                        type="button"
                        className="selected-recipe-qty-btn"
                        aria-label={`Increase servings for ${r.title}`}
                        onClick={() => setRecipeServings(r.id, servingsFor(r) + 1)}
                      >
                        +
                      </button>
                    </div>
                    <div className="selected-recipe-actions">
                      <button
                        type="button"
                        className="btn-remove selected-recipe-remove-btn"
                        title={`Remove ${r.title} from shopping list`}
                        aria-label={`Remove ${r.title} from shopping list`}
                        onClick={() => removeAllSlotsForRecipe(r.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="shopping-add-more-row">
            <Link
              to={addItemsFromShoppingHref}
              className="btn-secondary btn-compact shopping-add-more-recipes"
              aria-label="Browse recipes to add more to your shopping list"
            >
              Add more recipes
            </Link>
          </div>

          {renderAdditionalItemsEntry("Add something else")}

          {orderActions}

          {renderAdditionalItemsList()}

          <section className="detail-section">
            {combinedItems.length === 0 ? (
              <p className="muted">
                No mergeable ingredient rows in the selected recipes (empty or
                qualitative only).
              </p>
            ) : (
              <>
                {INGREDIENT_CATEGORY_ORDER.map((category) => {
                  const sectionItems = combinedByCategory.get(category) ?? [];
                  if (sectionItems.length === 0) {
                    return null;
                  }
                  return (
                    <div key={category} className="shopping-grocery-section">
                      <h3 className="shopping-grocery-section-heading">
                        {grocerySectionLabel(category)}
                        <span className="shopping-segment-count">
                          {" "}
                          ({sectionItems.length})
                        </span>
                      </h3>
                      <ul className="shopping-combined shopping-checklist">
                        {sectionItems.map((item, i) => {
                          const line = item.line;
                          const bought = isPurchased(line);
                          const alt = altConversionsForItem(item);
                          const visibleLabel = alt ? `${line} (${alt})` : line;
                          return (
                            <li key={`${category}-${line}-${i}`}>
                              <label
                                className={`shopping-check-row${
                                  bought ? " shopping-check-row--bought" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="shopping-check-input"
                                  checked={bought}
                                  onChange={() => togglePurchasedWithToast(line)}
                                  aria-label={`Purchased: ${visibleLabel}`}
                                />
                                <span className="shopping-check-label">
                                  <span className="shopping-check-primary">{line}</span>
                                  {alt ? (
                                    <span className="shopping-inline-alt"> ({alt})</span>
                                  ) : null}
                                  {item.notes.length > 0 ? (
                                    <span
                                      className="shopping-check-note"
                                      style={{
                                        display: "block",
                                        fontSize: "0.8em",
                                        color: "#777",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      {item.notes.join(", ")}
                                    </span>
                                  ) : null}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
          </section>

          {purchasedSection}

          <section className="detail-section">
            <h2>By recipe</h2>
            {mergeBreakdownsByRecipeId(sortedByRecipe).map((block) => (
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
          </section>
        </>
      ) : null}
    </>
  );
}
