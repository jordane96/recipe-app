import type { IngredientDef, Recipe, RecipeIngredientLine } from "./ingredientTypes";
import { TO_TASTE_UNIT } from "./ingredientTypes";

/**
 * Fractions a cook actually writes, smallest denominator first so `2/6` reduces to `⅓`.
 * Everything else (0.7, 1.85) stays decimal — inventing `7/10` would read worse than `0.70`.
 */
const COOKING_FRACTIONS: ReadonlyArray<{ value: number; glyph: string }> = [
  { value: 1 / 8, glyph: "⅛" },
  { value: 1 / 6, glyph: "⅙" },
  { value: 1 / 4, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 3 / 8, glyph: "⅜" },
  { value: 1 / 2, glyph: "½" },
  { value: 5 / 8, glyph: "⅝" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 3 / 4, glyph: "¾" },
  { value: 5 / 6, glyph: "⅚" },
  { value: 7 / 8, glyph: "⅞" },
];

/**
 * How far a decimal may sit from a cooking fraction and still be treated as that fraction.
 * Wide enough to catch what people actually type for thirds (`.33`, `.666`, `.67`) and narrow
 * enough that the neighbouring fractions never collide — the closest pair, ⅛ and ⅙, are 0.042
 * apart, i.e. four times this window.
 */
const FRACTION_TOLERANCE = 0.005;

/** The cooking fraction `frac` (0–1) rounds to, or null when it isn't near one. */
function nearestCookingFraction(frac: number): { value: number; glyph: string } | null {
  let best: { value: number; glyph: string } | null = null;
  let bestDelta = FRACTION_TOLERANCE;
  for (const candidate of COOKING_FRACTIONS) {
    const delta = Math.abs(frac - candidate.value);
    if (delta <= bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Snap a quantity that is *almost* a cooking fraction onto the exact value (`.666` → `2/3`).
 * Recipes are written in thirds and eighths but typed as decimals, and an un-snapped `0.666`
 * both displays as `0.67` and drifts when scaled. Values that aren't near a fraction pass through.
 */
export function snapToCookingFraction(n: number): number {
  if (!Number.isFinite(n) || n <= 0) {
    return n;
  }
  const whole = Math.floor(n);
  const match = nearestCookingFraction(n - whole);
  return match ? whole + match.value : n;
}

/**
 * Whole numbers without decimals (e.g. 1), cooking fractions as glyphs (`⅔`, `1½`), and
 * anything else to two decimal places (e.g. 1.30).
 */
export function formatQuantityDisplay(n: number): string {
  if (!Number.isFinite(n)) {
    return "";
  }
  const r2 = Math.round(n * 100) / 100;
  if (Math.abs(r2 - Math.round(r2)) < 1e-8) {
    return String(Math.round(r2));
  }
  if (n > 0) {
    const whole = Math.floor(n);
    const match = nearestCookingFraction(n - whole);
    if (match) {
      return whole === 0 ? match.glyph : `${whole}${match.glyph}`;
    }
  }
  return r2.toFixed(2);
}

export function ingredientMap(ingredients: IngredientDef[]): Map<string, IngredientDef> {
  return new Map(ingredients.map((i) => [i.id, i]));
}

/** Copy of a line with its amount multiplied by `scale`. Null amounts (e.g. "to taste") pass through. */
export function scaleIngredientLine(
  line: RecipeIngredientLine,
  scale: number,
): RecipeIngredientLine {
  if (scale === 1 || line.amount == null) {
    return line;
  }
  return { ...line, amount: line.amount * scale };
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

  // Decimals get snapped: someone typing `.666` for two thirds means ⅔, and storing the exact
  // value is what makes it display and scale as ⅔ rather than 0.67.
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? snapToCookingFraction(n) : null;
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
  includeNote = true,
): string {
  const def = byId.get(line.ingredientId);
  const name = def?.name ?? line.ingredientId;
  const note = includeNote && line.note ? ` ${line.note}` : "";
  if (line.unit === TO_TASTE_UNIT) {
    return `${name} - to taste${note}`.trim();
  }
  if (line.amount == null || line.unit == null) {
    return `${name}${note}`.trim();
  }
  const amt = formatQuantityDisplay(line.amount);
  return `${name} - ${amt} ${line.unit}${note}`.trim();
}
