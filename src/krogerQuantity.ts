/**
 * Suggest a cart quantity by comparing the recipe's needed amount to the Kroger
 * product's package `size`.
 *
 * Kroger returns `size` as free text ("1 lb", "16.9 fl oz", "12 ct", "1/2 Gallon").
 * We parse it to a number + dimension (weight/volume/count), convert to the same
 * canonical base as the recipe need (oz / tsp / count), and suggest
 * `ceil(need / packageSize)`. When the dimensions don't match (e.g. recipe in cups
 * but product sold by weight), or anything is unparseable / "to taste", we fall
 * back to 1 — the suggestion is only ever a smarter default; the user can override.
 */

export type Need =
  | { dim: "weight"; oz: number }
  | { dim: "volume"; tsp: number }
  | { dim: "count"; count: number };

export type ParsedSize = { dim: "weight" | "volume" | "count"; base: number };

/** Parse "1", "1.5", "1/2", "1 1/2" → number (null if not numeric). */
export function parseNum(raw: string): number | null {
  const s = raw.trim();
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const d = Number(mixed[3]);
    return d ? Number(mixed[1]) + Number(mixed[2]) / d : null;
  }
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const WEIGHT_TO_OZ: Record<string, number> = {
  oz: 1, ounce: 1, ounces: 1,
  lb: 16, lbs: 16, pound: 16, pounds: 16,
};

const VOLUME_TO_TSP: Record<string, number> = {
  tsp: 1, teaspoon: 1, teaspoons: 1,
  tbsp: 3, tablespoon: 3, tablespoons: 3,
  cup: 48, cups: 48,
  "fl oz": 6, floz: 6, "fluid ounce": 6, "fluid ounces": 6,
  pt: 96, pint: 96, pints: 96,
  qt: 192, quart: 192, quarts: 192,
  gal: 768, gallon: 768, gallons: 768,
  ml: 0.202884, milliliter: 0.202884, milliliters: 0.202884,
  l: 202.884, liter: 202.884, liters: 202.884, litre: 202.884,
};

const COUNT_UNITS: Record<string, number> = {
  ct: 1, count: 1, ea: 1, each: 1, pk: 1, pack: 1, packs: 1,
  dozen: 12, dz: 12, doz: 12,
};

function normUnit(u: string): string {
  return u.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
}

/** Parse a Kroger `size` string into a canonical base amount + dimension. */
export function parseSize(size: string | null | undefined): ParsedSize | null {
  if (!size) return null;

  // Multipacks like "6 x 1 lb" → 6 × inner.
  const mult = size.match(/^\s*(\d+)\s*[x×]\s*(.+)$/i);
  if (mult) {
    const inner = parseSize(mult[2]);
    return inner ? { dim: inner.dim, base: inner.base * Number(mult[1]) } : null;
  }

  const m = size.trim().match(/^([\d.\/\s]+)\s*([a-zA-Z][a-zA-Z. ]*)$/);
  if (!m) return null;
  const amount = parseNum(m[1]!);
  if (amount == null || amount <= 0) return null;
  const unit = normUnit(m[2]!);

  if (unit in WEIGHT_TO_OZ) return { dim: "weight", base: amount * WEIGHT_TO_OZ[unit]! };
  if (unit in VOLUME_TO_TSP) return { dim: "volume", base: amount * VOLUME_TO_TSP[unit]! };
  if (unit in COUNT_UNITS) return { dim: "count", base: amount * COUNT_UNITS[unit]! };
  return null;
}

/** Packages needed to cover `need`, given the product's `size`. Falls back to 1. */
export function suggestQuantity(need: Need | null, size: string | null | undefined): number {
  if (!need) return 1;
  const s = parseSize(size);
  if (!s || s.dim !== need.dim || s.base <= 0) return 1;
  const needBase = need.dim === "weight" ? need.oz : need.dim === "volume" ? need.tsp : need.count;
  if (!(needBase > 0)) return 1;
  const qty = Math.ceil(needBase / s.base - 1e-9); // epsilon so 16oz / 16oz = 1, not 2
  return Math.min(99, Math.max(1, qty));
}
