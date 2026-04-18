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
};

const ShoppingListContext = React.createContext<Ctx | null>(null);

export function ShoppingListProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : readIds(),
  );
  const [purchased, setPurchased] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : readPurchased(),
  );

  React.useEffect(() => {
    writeIds(selectedIds);
  }, [selectedIds]);

  React.useEffect(() => {
    writePurchased(purchased);
  }, [purchased]);

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
      syncRecipeSlotsToCount,
      clearList,
      purchasedKeys: purchasedSet,
      isPurchased,
      togglePurchased,
      setPurchasedBatch,
      clearPurchased,
      prunePurchasedToValidLines,
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
    syncRecipeSlotsToCount,
    clearList,
    purchasedSet,
    isPurchased,
    togglePurchased,
    setPurchasedBatch,
    clearPurchased,
    prunePurchasedToValidLines,
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
