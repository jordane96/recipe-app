import * as React from "react";

const STORAGE_KEY = "recipe-app-plan-shop-authority-v1";

/** Which surface the user last edited for this recipe’s counts (while plan ≠ list). */
export type PlanShoppingSource = "plan" | "shopping";

type MapState = Record<string, PlanShoppingSource>;

let authorityMap: MapState = {};
let version = 0;
const listeners = new Set<() => void>();

function load(): MapState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null || Array.isArray(p)) {
      return {};
    }
    const out: MapState = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (v === "plan" || v === "shopping") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authorityMap));
  } catch {
    /* ignore */
  }
}

function bump() {
  version += 1;
  for (const l of listeners) {
    l();
  }
}

if (typeof window !== "undefined") {
  authorityMap = load();
}

export function getRecipeCountSource(recipeId: string): PlanShoppingSource | undefined {
  return authorityMap[recipeId];
}

/** Treat missing entry as “plan was last authoritative” for mismatch UX (matches prior behavior). */
export function shoppingListShouldFollowPlan(recipeId: string): boolean {
  return authorityMap[recipeId] !== "shopping";
}

export function mealPlanShouldFollowShoppingList(recipeId: string): boolean {
  return authorityMap[recipeId] === "shopping";
}

export function markRecipeSourcePlan(recipeId: string) {
  if (authorityMap[recipeId] === "plan") {
    return;
  }
  authorityMap = { ...authorityMap, [recipeId]: "plan" };
  save();
  bump();
}

export function markRecipeSourcePlanMany(recipeIds: string[]) {
  const uniq = [...new Set(recipeIds)].filter(Boolean);
  if (uniq.length === 0) {
    return;
  }
  let changed = false;
  const next = { ...authorityMap };
  for (const id of uniq) {
    if (next[id] !== "plan") {
      next[id] = "plan";
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  authorityMap = next;
  save();
  bump();
}

export function markRecipeSourceShopping(recipeId: string) {
  if (authorityMap[recipeId] === "shopping") {
    return;
  }
  authorityMap = { ...authorityMap, [recipeId]: "shopping" };
  save();
  bump();
}

export function clearRecipeCountSource(recipeId: string) {
  if (!(recipeId in authorityMap)) {
    return;
  }
  const next = { ...authorityMap };
  delete next[recipeId];
  authorityMap = next;
  save();
  bump();
}

export function resetAllCountSources() {
  if (Object.keys(authorityMap).length === 0) {
    return;
  }
  authorityMap = {};
  save();
  bump();
}

export function subscribePlanShoppingAuthority(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlanShoppingAuthorityVersion(): number {
  return version;
}

export function usePlanShoppingAuthorityVersion(): number {
  return React.useSyncExternalStore(
    subscribePlanShoppingAuthority,
    getPlanShoppingAuthorityVersion,
    () => 0,
  );
}
