import type { Recipe } from "./types";

export const QUALITATIVE_OVERRIDES_KEY = "recipe-app-qualitative-overrides-v1";

export type LineOverride = { amount: number; unit: string };

function stableLineKey(
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
