import type { IngredientDef, Recipe, RecipeIngredientLine } from "./ingredientTypes";
import { TO_TASTE_UNIT } from "./ingredientTypes";

/** Whole numbers without decimals (e.g. 1); otherwise two decimal places (e.g. 1.30). */
export function formatQuantityDisplay(n: number): string {
  if (!Number.isFinite(n)) {
    return "";
  }
  const r2 = Math.round(n * 100) / 100;
  if (Math.abs(r2 - Math.round(r2)) < 1e-8) {
    return String(Math.round(r2));
  }
  return r2.toFixed(2);
}

export function ingredientMap(ingredients: IngredientDef[]): Map<string, IngredientDef> {
  return new Map(ingredients.map((i) => [i.id, i]));
}

const VULGAR_FRACTIONS: Record<string, number> = {
  "¼": 1 / 4,
  "½": 1 / 2,
  "¾": 3 / 4,
  "⅐": 1 / 7,
  "⅑": 1 / 9,
  "⅒": 1 / 10,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

/**
 * Parse a user-typed quantity into a number. Accepts plain decimals/integers ("2", "0.5"),
 * ASCII fractions ("3/4"), mixed numbers ("1 1/2"), and unicode vulgar fractions ("½", "1½",
 * "1 ½"). Returns null when the input can't be parsed (caller decides how to treat null/≤0).
 */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim();
  if (s === "") {
    return null;
  }

  // Whole (optional) + unicode fraction: "½", "1½", "1 ½"
  const vulgarChars = Object.keys(VULGAR_FRACTIONS).join("");
  const uni = new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${vulgarChars}])$`);
  const um = s.match(uni);
  if (um) {
    const whole = um[1] ? Number.parseFloat(um[1]) : 0;
    const frac = VULGAR_FRACTIONS[um[2]!];
    if (frac == null || !Number.isFinite(whole)) {
      return null;
    }
    return whole + frac;
  }

  // Mixed ASCII fraction: "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number.parseInt(mixed[1]!, 10);
    const num = Number.parseInt(mixed[2]!, 10);
    const den = Number.parseInt(mixed[3]!, 10);
    return den === 0 ? null : whole + num / den;
  }

  // Simple ASCII fraction: "3/4"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = Number.parseInt(frac[1]!, 10);
    const den = Number.parseInt(frac[2]!, 10);
    return den === 0 ? null : num / den;
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Like {@link ingredientMap} but also includes recipe-scoped custom ingredient defs from one
 * or more recipes. Custom defs are merged AFTER the globals so a custom can shadow a global
 * id (last-write wins; rare in practice). Use this anywhere you render ingredient lines for a
 * recipe so custom-* ids resolve to their human names instead of leaking the raw id.
 */
export function ingredientMapWithRecipes(
  ingredients: IngredientDef[],
  recipes: ReadonlyArray<Pick<Recipe, "customIngredientDefs">>,
): Map<string, IngredientDef> {
  const m = new Map<string, IngredientDef>(ingredients.map((i) => [i.id, i]));
  for (const r of recipes) {
    for (const def of r.customIngredientDefs ?? []) {
      m.set(def.id, def);
    }
  }
  return m;
}

export function formatIngredientLine(
  line: RecipeIngredientLine,
  byId: Map<string, IngredientDef>,
): string {
  const def = byId.get(line.ingredientId);
  const name = def?.name ?? line.ingredientId;
  const note = line.note ? ` ${line.note}` : "";
  if (line.unit === TO_TASTE_UNIT) {
    return `${name} - to taste${note}`.trim();
  }
  if (line.amount == null || line.unit == null) {
    return `${name}${note}`.trim();
  }
  const amt = formatQuantityDisplay(line.amount);
  return `${name} - ${amt} ${line.unit}${note}`.trim();
}
