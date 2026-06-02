import * as React from "react";
import {
  clearRecipeCountSource,
  markRecipeSourcePlan,
  markRecipeSourceShopping,
  resetAllCountSources,
} from "./planShoppingAuthority";
import { normalizeShoppingLineKey } from "./shoppingLineKey";

const STORAGE_SELECTED = "recipe-app-shopping-v1";
const STORAGE_PURCHASED = "recipe-app-purchased-v1";
const STORAGE_ADDITIONAL = "recipe-app-additional-items-v1";
const STORAGE_SERVINGS = "recipe-app-shopping-servings-v1";

/** Per-recipe servings override on the shopping list (independent of the menu). */
function readServings(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_SERVINGS);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (p == null || typeof p !== "object" || Array.isArray(p)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
    }
    return out;
  } catch {
    return {};
  }
}

function writeServings(map: Record<string, number>) {
  localStorage.setItem(STORAGE_SERVINGS, JSON.stringify(map));
}

function readAdditional(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_ADDITIONAL);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeAdditional(items: string[]) {
  localStorage.setItem(STORAGE_ADDITIONAL, JSON.stringify(items));
}

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SELECTED);
    if (!raw) {
      return [];
    }
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) {
      return [];
    }
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  localStorage.setItem(STORAGE_SELECTED, JSON.stringify(ids));
}

function readPurchased(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PURCHASED);
    if (!raw) {
      return [];
    }
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) {
      return [];
    }
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writePurchased(keys: string[]) {
  localStorage.setItem(STORAGE_PURCHASED, JSON.stringify(keys));
}

type Ctx = {
  /** Recipe ids in list order; duplicates = multiple portions / schedule slots. */
  selectedIds: string[];
  count: number;
  listQuantity: (id: string) => number;
  isSelected: (id: string) => boolean;
  /** Default: last touch = shopping. From meal planner “Add to list”, pass `{ countAuthority: \"plan\" }`. */
  addToList: (id: string, options?: { countAuthority?: "plan" | "shopping" }) => void;
  /** Removes one occurrence of id (first in list). */
  removeFromList: (id: string) => void;
  /** Removes every slot for this recipe id. */
  removeAllSlotsForRecipe: (id: string) => void;
  /** If the list is empty, set to these ids (hydrate from saved meal plan). */
  hydrateShoppingIfEmpty: (ids: string[]) => void;
  /** Replace the list with exactly these ids (bulk replace). */
  replaceSelectedIds: (ids: string[]) => void;
  /**
   * Meal plan "Shop ingredients": replace the list with this snapshot, clear plan/shop
   * count authority, and clear purchased (new run from the menu).
   */
  pushFromMenu: (entries: Array<{ recipeId: string; servings: number }>) => void;
  /**
   * Set how many shopping slots this recipe has: removes all occurrences of recipeId,
   * then appends targetCount copies at the end (other recipes keep relative order).
   */
  syncRecipeSlotsToCount: (recipeId: string, targetCount: number) => void;
  clearList: () => void;
  /** Normalized combined-line keys marked as purchased */
  purchasedKeys: ReadonlySet<string>;
  isPurchased: (line: string) => boolean;
  togglePurchased: (line: string) => void;
  /** Set purchased state for many combined-list lines at once (normalized keys). */
  setPurchasedBatch: (lines: string[], purchased: boolean) => void;
  clearPurchased: () => void;
  /** Drop purchased keys that are not on the current combined list */
  prunePurchasedToValidLines: (lines: string[]) => void;
  /**
   * Free-text shopping items not derived from any recipe (e.g. "coffee filters", "foil").
   * Ordered by insertion. Use {@link isPurchased} / {@link togglePurchased} against the item
   * text to participate in the same purchased flow as recipe-derived lines.
   */
  additionalItems: string[];
  /** Append a free-text item. Trims; dedupes case-insensitively; no-op on empty / duplicate. */
  addAdditionalItem: (text: string) => void;
  /** Remove a free-text item by exact text. Also clears any purchased mark for that line. */
  removeAdditionalItem: (text: string) => void;
  /**
   * Per-recipe servings override for the shopping list. Independent of the menu. When a
   * recipe has no entry here, the UI falls back to the recipe's own base servings. Used to
   * scale ingredient quantities: multiple = thisServings ÷ recipeBaseServings.
   */
  servingsByRecipe: Record<string, number>;
  /** Set the shopping-list servings for a recipe (clamped 1–99). */
  setRecipeServings: (recipeId: string, servings: number) => void;
};

const ShoppingListContext = React.createContext<Ctx | null>(null);

export function ShoppingListProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : readIds(),
  );
  const [purchased, setPurchased] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : readPurchased(),
  );
  const [servingsByRecipe, setServingsByRecipe] = React.useState<Record<string, number>>(() =>
    typeof window === "undefined" ? {} : readServings(),
  );
  const [additionalItems, setAdditionalItems] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : readAdditional(),
  );

  React.useEffect(() => {
    writeIds(selectedIds);
  }, [selectedIds]);

  React.useEffect(() => {
    writePurchased(purchased);
  }, [purchased]);

  React.useEffect(() => {
    writeAdditional(additionalItems);
  }, [additionalItems]);

  React.useEffect(() => {
    writeServings(servingsByRecipe);
  }, [servingsByRecipe]);

  const setRecipeServings = React.useCallback((recipeId: string, servings: number) => {
    const n = Math.min(99, Math.max(1, Math.floor(Number(servings))));
    setServingsByRecipe((prev) => {
      if (prev[recipeId] === n) return prev;
      return { ...prev, [recipeId]: n };
    });
  }, []);

  const addAdditionalItem = React.useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setAdditionalItems((prev) => {
      // Case-insensitive dedupe.
      const lower = t.toLowerCase();
      if (prev.some((x) => x.toLowerCase() === lower)) return prev;
      return [...prev, t];
    });
  }, []);

  const removeAdditionalItem = React.useCallback((text: string) => {
    setAdditionalItems((prev) => prev.filter((x) => x !== text));
    // Also clear any purchased mark for this line — otherwise it would ghost in Purchased.
    const k = normalizeShoppingLineKey(text);
    setPurchased((prev) => prev.filter((x) => x !== k));
  }, []);

  const purchasedSet = React.useMemo(() => new Set(purchased), [purchased]);

  const listQuantity = React.useCallback(
    (id: string) => selectedIds.filter((x) => x === id).length,
    [selectedIds],
  );

  const isSelected = React.useCallback(
    (id: string) => selectedIds.includes(id),
    [selectedIds],
  );

  const addToList = React.useCallback((id: string, options?: { countAuthority?: "plan" | "shopping" }) => {
    const src = options?.countAuthority ?? "shopping";
    if (src === "plan") {
      markRecipeSourcePlan(id);
    } else {
      markRecipeSourceShopping(id);
    }
    setSelectedIds((prev) => [...prev, id]);
  }, []);

  const removeFromList = React.useCallback((id: string) => {
    markRecipeSourceShopping(id);
    setSelectedIds((prev) => {
      const i = prev.indexOf(id);
      if (i === -1) {
        return prev;
      }
      return [...prev.slice(0, i), ...prev.slice(i + 1)];
    });
  }, []);

  const removeAllSlotsForRecipe = React.useCallback((id: string) => {
    markRecipeSourceShopping(id);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    // Drop any servings override for a recipe no longer on the list.
    setServingsByRecipe((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const hydrateShoppingIfEmpty = React.useCallback((ids: string[]) => {
    setSelectedIds((prev) => (prev.length > 0 ? prev : [...ids]));
  }, []);

  const replaceSelectedIds = React.useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      if (prev.length === ids.length && prev.every((x, i) => x === ids[i])) {
        return prev;
      }
      const countAt = (arr: string[], recipeId: string) =>
        arr.reduce((n, x) => n + (x === recipeId ? 1 : 0), 0);
      const touched = new Set([...prev, ...ids]);
      for (const id of touched) {
        if (countAt(prev, id) !== countAt(ids, id)) {
          markRecipeSourceShopping(id);
        }
      }
      return [...ids];
    });
  }, []);

  const pushFromMenu = React.useCallback(
    (entries: Array<{ recipeId: string; servings: number }>) => {
      resetAllCountSources();
      setPurchased([]);
      // One membership entry per recipe; seed its shopping servings from the menu.
      const ids: string[] = [];
      const servings: Record<string, number> = {};
      for (const { recipeId, servings: s } of entries) {
        if (!(recipeId in servings)) ids.push(recipeId);
        const n = Math.min(99, Math.max(1, Math.floor(Number(s))));
        servings[recipeId] = (servings[recipeId] ?? 0) + n;
      }
      setSelectedIds(ids);
      setServingsByRecipe(servings);
    },
    [],
  );

  const syncRecipeSlotsToCount = React.useCallback((recipeId: string, targetCount: number) => {
    const n = Math.max(0, Math.min(999, Math.floor(Number(targetCount))));
    setSelectedIds((prev) => {
      const rest = prev.filter((id) => id !== recipeId);
      const added = Array.from({ length: n }, () => recipeId);
      return [...rest, ...added];
    });
    clearRecipeCountSource(recipeId);
  }, []);

  const clearList = React.useCallback(() => {
    resetAllCountSources();
    setSelectedIds([]);
    setPurchased([]);
    setServingsByRecipe({});
  }, []);

  const isPurchased = React.useCallback(
    (line: string) => purchasedSet.has(normalizeShoppingLineKey(line)),
    [purchasedSet],
  );

  const togglePurchased = React.useCallback((line: string) => {
    const k = normalizeShoppingLineKey(line);
    setPurchased((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }, []);

  const setPurchasedBatch = React.useCallback((lines: string[], want: boolean) => {
    const keys = lines.map((l) => normalizeShoppingLineKey(l));
    setPurchased((prev) => {
      const set = new Set(prev);
      let changed = false;
      for (const k of keys) {
        if (want) {
          if (!set.has(k)) {
            set.add(k);
            changed = true;
          }
        } else if (set.has(k)) {
          set.delete(k);
          changed = true;
        }
      }
      if (!changed) {
        return prev;
      }
      return [...set];
    });
  }, []);

  const clearPurchased = React.useCallback(() => {
    setPurchased([]);
  }, []);

  const prunePurchasedToValidLines = React.useCallback((lines: string[]) => {
    const valid = new Set(lines.map((l) => normalizeShoppingLineKey(l)));
    setPurchased((prev) => {
      const next = prev.filter((k) => valid.has(k));
      if (
        next.length === prev.length &&
        next.every((k, i) => k === prev[i])
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const value = React.useMemo((): Ctx => {
    return {
      selectedIds,
      count: selectedIds.length,
      listQuantity,
      isSelected,
      addToList,
      removeFromList,
      removeAllSlotsForRecipe,
      hydrateShoppingIfEmpty,
      replaceSelectedIds,
      pushFromMenu,
      syncRecipeSlotsToCount,
      clearList,
      purchasedKeys: purchasedSet,
      isPurchased,
      togglePurchased,
      setPurchasedBatch,
      clearPurchased,
      prunePurchasedToValidLines,
      additionalItems,
      addAdditionalItem,
      removeAdditionalItem,
      servingsByRecipe,
      setRecipeServings,
    };
  }, [
    selectedIds,
    listQuantity,
    isSelected,
    addToList,
    removeFromList,
    removeAllSlotsForRecipe,
    hydrateShoppingIfEmpty,
    replaceSelectedIds,
    pushFromMenu,
    syncRecipeSlotsToCount,
    clearList,
    servingsByRecipe,
    setRecipeServings,
    purchasedSet,
    isPurchased,
    togglePurchased,
    setPurchasedBatch,
    clearPurchased,
    prunePurchasedToValidLines,
    additionalItems,
    addAdditionalItem,
    removeAdditionalItem,
  ]);

  return (
    <ShoppingListContext.Provider value={value}>
      {children}
    </ShoppingListContext.Provider>
  );
}

export function useShoppingList(): Ctx {
  const ctx = React.useContext(ShoppingListContext);
  if (!ctx) {
    throw new Error("useShoppingList must be used within ShoppingListProvider");
  }
  return ctx;
}
