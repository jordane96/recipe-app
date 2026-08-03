import * as React from "react";
import {
  clearRecipeCountSource,
  getAllCountSources,
  markRecipeSourcePlan,
  markRecipeSourcePlanMany,
  markRecipeSourceShopping,
  resetAllCountSources,
  restoreAllCountSources,
  type PlanShoppingSource,
} from "./planShoppingAuthority";
import { normalizeShoppingLineKey } from "./shoppingLineKey";
import {
  loadAlwaysHave,
  loadNeedThisTime,
  saveAlwaysHave,
  saveNeedThisTime,
} from "./pantryStorage";

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

/**
 * Everything clearList() destroys, captured so it can be put back. Kept as one object
 * so callers can hold it opaquely and hand it straight back to restoreList().
 */
export type ShoppingListSnapshot = {
  selectedIds: string[];
  purchased: string[];
  servingsByRecipe: Record<string, number>;
  additionalItems: string[];
  countSources: Record<string, PlanShoppingSource>;
  /** Staples pulled onto this shop; scoped to the shop, so cleared and restored with it. */
  needThisTime: string[];
};

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
   * Meal plan "Shop ingredients": **appends** the selected meals to the existing list.
   * Nothing is ever removed — other recipes, purchased marks and manual items all survive.
   * A recipe already on the list is not duplicated; instead its servings are retuned to the
   * menu's value (re-shopping is an explicit act, so the menu wins). Returns which recipes
   * were `added` and which had servings `updated`, so the caller can report what happened.
   */
  pushFromMenu: (
    entries: Array<{ recipeId: string; servings: number }>,
  ) => { added: string[]; updated: string[] };
  /**
   * Set how many shopping slots this recipe has: removes all occurrences of recipeId,
   * then appends targetCount copies at the end (other recipes keep relative order).
   */
  syncRecipeSlotsToCount: (recipeId: string, targetCount: number) => void;
  /** Wipes the list and returns a snapshot for {@link restoreList}. Return value is optional to use. */
  clearList: () => ShoppingListSnapshot;
  /** Restore a snapshot returned by {@link clearList} — backs the "Undo" toast action. */
  restoreList: (snapshot: ShoppingListSnapshot) => void;
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

  /**
   * Ingredient ids previously marked "I always have this" — permanently suppressed from the
   * shopping list. Nothing sets this any more (the button was removed); it's read so that
   * anyone who marked items before then can still restore them via {@link resetAlwaysHave}.
   */
  alwaysHaveIds: ReadonlySet<string>;
  /** Staples pulled back onto the list for this shop only (e.g. ran out of olive oil). */
  needThisTimeIds: ReadonlySet<string>;
  /** Move a staple onto the main list for this shop. */
  markStapleNeeded: (ingredientId: string) => void;
  /** Send a staple back to the tray (undoes {@link markStapleNeeded}). */
  unmarkStapleNeeded: (ingredientId: string) => void;
  /** Un-hide everything left over from the removed "always have" action. */
  resetAlwaysHave: () => void;
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
  const [alwaysHave, setAlwaysHave] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadAlwaysHave(),
  );
  const [needThisTime, setNeedThisTime] = React.useState<string[]>(() =>
    typeof window === "undefined" ? [] : loadNeedThisTime(),
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

  React.useEffect(() => {
    saveAlwaysHave(alwaysHave);
  }, [alwaysHave]);

  React.useEffect(() => {
    saveNeedThisTime(needThisTime);
  }, [needThisTime]);

  const alwaysHaveIds = React.useMemo(() => new Set(alwaysHave), [alwaysHave]);
  const needThisTimeIds = React.useMemo(() => new Set(needThisTime), [needThisTime]);

  const markStapleNeeded = React.useCallback((ingredientId: string) => {
    setNeedThisTime((prev) => (prev.includes(ingredientId) ? prev : [...prev, ingredientId]));
  }, []);

  const unmarkStapleNeeded = React.useCallback((ingredientId: string) => {
    setNeedThisTime((prev) => prev.filter((x) => x !== ingredientId));
  }, []);

  const resetAlwaysHave = React.useCallback(() => {
    setAlwaysHave([]);
  }, []);

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
    (
      entries: Array<{ recipeId: string; servings: number }>,
    ): { added: string[]; updated: string[] } => {
      // Collapse duplicate menu slots for the same recipe into one entry with summed servings.
      const wanted = new Map<string, number>();
      for (const { recipeId, servings: s } of entries) {
        const n = Math.min(99, Math.max(1, Math.floor(Number(s))));
        wanted.set(recipeId, Math.min(99, (wanted.get(recipeId) ?? 0) + n));
      }
      const existing = new Set(selectedIds);
      const added = [...wanted.keys()].filter((id) => !existing.has(id));
      // Already on the list: re-shopping from the menu is an explicit act, so the menu's
      // servings win. No duplicate row — the existing one is retuned in place.
      const updated = [...wanted.keys()].filter(
        (id) => existing.has(id) && servingsByRecipe[id] !== wanted.get(id),
      );

      setSelectedIds((prev) => [...prev, ...added]);
      setServingsByRecipe((prev) => {
        const next = { ...prev };
        for (const id of [...added, ...updated]) {
          next[id] = wanted.get(id)!;
        }
        return next;
      });
      // The plan is now authoritative for everything the menu just pushed.
      markRecipeSourcePlanMany([...added, ...updated]);
      return { added, updated };
    },
    [selectedIds, servingsByRecipe],
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

  /**
   * Clears everything and returns a snapshot so the caller can offer an undo.
   * Callers that don't want undo can simply ignore the return value.
   */
  const clearList = React.useCallback((): ShoppingListSnapshot => {
    const snapshot: ShoppingListSnapshot = {
      selectedIds,
      purchased,
      servingsByRecipe,
      additionalItems,
      countSources: getAllCountSources(),
      needThisTime,
    };
    resetAllCountSources();
    setSelectedIds([]);
    setPurchased([]);
    setServingsByRecipe({});
    setAdditionalItems([]);
    // "Need this time" is scoped to a shop — a cleared list starts that decision over.
    // `alwaysHave` deliberately survives: it's a standing preference, not shop state.
    setNeedThisTime([]);
    return snapshot;
  }, [selectedIds, purchased, servingsByRecipe, additionalItems, needThisTime]);

  /** Restores a snapshot from clearList(). Used by the "Undo" toast action. */
  const restoreList = React.useCallback((snapshot: ShoppingListSnapshot) => {
    restoreAllCountSources(snapshot.countSources);
    setSelectedIds(snapshot.selectedIds);
    setPurchased(snapshot.purchased);
    setServingsByRecipe(snapshot.servingsByRecipe);
    setAdditionalItems(snapshot.additionalItems);
    setNeedThisTime(snapshot.needThisTime ?? []);
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
      restoreList,
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
      alwaysHaveIds,
      needThisTimeIds,
      markStapleNeeded,
      unmarkStapleNeeded,
      resetAlwaysHave,
    };
  }, [
    alwaysHaveIds,
    needThisTimeIds,
    markStapleNeeded,
    unmarkStapleNeeded,
    resetAlwaysHave,
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
    restoreList,
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
