import * as React from "react";
import { buildShoppingListData, type CombinedShoppingItem } from "./shoppingMerge";
import { parseNum, type Need } from "./krogerQuantity";
import type { IngredientDef, Recipe } from "./types";
import { useShoppingList } from "./ShoppingListContext";

/**
 * Shared "things to buy" derivation for the retailer order pages (Kroger, Safeway).
 * Combines the selected recipes' scaled ingredient lines with free-text additional
 * items, excluding anything already marked purchased.
 */

export type BuyItem = {
  /** Stable row key (combined line text, or `additional:<text>`). */
  key: string;
  /** Clean search term for a retailer product search ("Name - 2 tbsp" → "Name"). */
  name: string;
  /** Original shopping-list line, for display. */
  label: string;
  /** Recipe amount this line needs (drives Kroger's quantity suggestion); null = no suggestion. */
  need: Need | null;
  /** Distinct prep notes from the contributing recipes (e.g. "chopped"); [] for free-text items. */
  notes: string[];
};

/** Pull a clean search term out of a combined shopping line ("Name - 2 tbsp" → "Name"). */
export function termFromLine(line: string): string {
  return line.split(" - ")[0]!.trim();
}

/** The recipe's needed amount (for the quantity suggestion), derived from a combined line. */
function needFromItem(it: CombinedShoppingItem): Need | null {
  if (it.kind === "weight") return { dim: "weight", oz: it.oz };
  if (it.kind === "volume") return { dim: "volume", tsp: it.tsp };
  if (it.kind === "count") {
    // Combined count lines look like "Eggs - 6 each"; only generic counts map to packages.
    const after = it.line.split(" - ").slice(1).join(" - ");
    const m = after.match(/^([\d.\/]+)\s+([a-zA-Z]+)/);
    if (m) {
      const n = parseNum(m[1]!);
      const unit = m[2]!.toLowerCase();
      if (n && n > 0 && (unit === "each" || unit === "ct" || unit === "count")) {
        return { dim: "count", count: n };
      }
    }
  }
  return null; // raw / qualitative / non-generic counts → default qty 1
}

export function useBuyItems(recipes: Recipe[], ingredients: IngredientDef[]): BuyItem[] {
  const { selectedIds, servingsByRecipe, additionalItems, isPurchased } = useShoppingList();

  return React.useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, { recipe: Recipe; count: number }>();
    for (const id of selectedIds) {
      const r = recipes.find((x) => x.id === id);
      if (!r) continue;
      if (!counts.has(r.id)) {
        order.push(r.id);
        counts.set(r.id, { recipe: r, count: 0 });
      }
      counts.get(r.id)!.count += 1;
    }
    const entries = order.map((id) => {
      const { recipe } = counts.get(id)!;
      const base = typeof recipe.servings === "number" && recipe.servings > 0 ? recipe.servings : null;
      const override = servingsByRecipe[recipe.id];
      const target = typeof override === "number" && override > 0 ? override : base ?? 1;
      const scale = base == null ? 1 : target / base;
      return { recipe, scale };
    });
    const { combinedItems } = buildShoppingListData(entries, ingredients);

    const fromRecipes = combinedItems
      .filter((it) => !isPurchased(it.line))
      .map((it) => ({
        key: it.line,
        name: termFromLine(it.line),
        label: it.line,
        need: needFromItem(it),
        notes: [...it.notes],
      }));
    const fromAdditional = additionalItems
      .filter((t) => !isPurchased(t))
      .map((t) => ({ key: `additional:${t}`, name: t, label: t, need: null as Need | null, notes: [] as string[] }));
    return [...fromRecipes, ...fromAdditional];
  }, [selectedIds, recipes, ingredients, servingsByRecipe, additionalItems, isPurchased]);
}
