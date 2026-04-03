import type { Recipe, RecipeIngredientLine } from "./types";

export const QUALITATIVE_OVERRIDES_KEY = "recipe-app-qualitative-overrides-v1";

export const QUALITATIVE_OVERRIDES_CHANGED = "recipe-app-qual-overrides-changed";

function notifyQualitativeOverridesChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(QUALITATIVE_OVERRIDES_CHANGED));
}

export type LineOverride = { amount: number; unit: string };

/** Stable key for a line in published data (survives if line order changes within same section? No - same ingredient+note in same section could collide). */
export function stableLineKey(
  recipeId: string,
  sectionName: string,
  ingredientId: string,
  note?: string,
): string {
  const n = (note ?? "").trim();
  return `${recipeId}\n${sectionName}\n${ingredientId}\n${n}`;
}

export function loadQualitativeOverrides(): Record<string, LineOverride> {
  try {
    const s = localStorage.getItem(QUALITATIVE_OVERRIDES_KEY);
    if (!s) {
      return {};
    }
    const o = JSON.parse(s) as unknown;
    if (typeof o !== "object" || o === null || Array.isArray(o)) {
      return {};
    }
    return o as Record<string, LineOverride>;
  } catch {
    return {};
  }
}

export function saveQualitativeOverrides(m: Record<string, LineOverride>) {
  localStorage.setItem(QUALITATIVE_OVERRIDES_KEY, JSON.stringify(m));
  notifyQualitativeOverridesChanged();
}

export function collectQualitativeLines(recipes: Recipe[]): Array<{
  recipeId: string;
  recipeTitle: string;
  sectionName: string;
  line: RecipeIngredientLine;
  key: string;
}> {
  const out: Array<{
    recipeId: string;
    recipeTitle: string;
    sectionName: string;
    line: RecipeIngredientLine;
    key: string;
  }> = [];
  for (const r of recipes) {
    for (const sec of r.ingredientSections ?? []) {
      for (const line of sec.lines) {
        if (line.amount == null || line.unit == null) {
          out.push({
            recipeId: r.id,
            recipeTitle: r.title,
            sectionName: sec.name,
            line,
            key: stableLineKey(r.id, sec.name, line.ingredientId, line.note),
          });
        }
      }
    }
  }
  out.sort((a, b) => {
    const t = a.recipeTitle.localeCompare(b.recipeTitle);
    if (t !== 0) {
      return t;
    }
    return a.key.localeCompare(b.key);
  });
  return out;
}

export function applyQualitativeOverrides(
  recipes: Recipe[],
  overrides: Record<string, LineOverride>,
): Recipe[] {
  return recipes.map((r) => {
    const copy = JSON.parse(JSON.stringify(r)) as Recipe;
    for (const sec of copy.ingredientSections ?? []) {
      for (const line of sec.lines) {
        if (line.amount != null && line.unit != null) {
          continue;
        }
        const k = stableLineKey(r.id, sec.name, line.ingredientId, line.note);
        const o = overrides[k];
        if (
          o &&
          typeof o.amount === "number" &&
          Number.isFinite(o.amount) &&
          typeof o.unit === "string" &&
          o.unit.trim()
        ) {
          line.amount = o.amount;
          line.unit = o.unit.trim();
        }
      }
    }
    return copy;
  });
}
