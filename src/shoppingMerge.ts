import type { IngredientDef, IngredientKind, Recipe, RecipeIngredientLine } from "./ingredientTypes";
import { formatIngredientLine, formatQuantityDisplay, ingredientMap } from "./ingredientDisplay";

const VOL_TO_TSP: Record<string, number> = {
  tsp: 1,
  tbsp: 3,
  cup: 48,
};

const WT_TO_OZ: Record<string, number> = {
  oz: 1,
  lb: 16,
};

function normUnit(u: string): string {
  return u.trim().toLowerCase();
}

/** Same rules as formatQuantityDisplay; non-finite values show —. */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) {
    return "—";
  }
  return formatQuantityDisplay(n) || "—";
}

function toVolumeBase(amount: number, unit: string): number {
  const m = VOL_TO_TSP[normUnit(unit)];
  if (m === undefined) {
    return NaN;
  }
  return amount * m;
}

function toWeightBase(amount: number, unit: string): number {
  const m = WT_TO_OZ[normUnit(unit)];
  if (m === undefined) {
    return NaN;
  }
  return amount * m;
}

/** Which unit scale the primary volume display uses (parentheticals omit that scale). */
export type VolumePrimaryTier = "tsp" | "tbsp" | "cup";

function cupLabelForAmount(cups: number): string {
  const r = Math.round(cups * 10000) / 10000;
  return Math.abs(r - 1) < 1e-8 ? "cup" : "cups";
}

/**
 * True when x tsp is a common baking fraction of a cup (below 1 cup).
 * Requires at least 1/4 cup (12 tsp): smaller amounts like 2 tbsp (6 tsp = ⅛ cup)
 * stay primary in tbsp so the list matches recipe wording.
 */
function isNiceCupFractionTsp(x: number): boolean {
  if (x < 12 || x >= 48) {
    return false;
  }
  const c = x / 48;
  const eighth = Math.round(c * 8);
  if (eighth >= 1 && eighth <= 7 && Math.abs(c - eighth / 8) < 0.03) {
    return true;
  }
  const third = Math.round(c * 3);
  if ((third === 1 || third === 2) && Math.abs(c - third / 3) < 0.03) {
    return true;
  }
  return false;
}

function formatCupsFromTsp(x: number): string {
  const cups = x / 48;
  return `${fmtQty(cups)} ${cupLabelForAmount(cups)}`;
}

function volumePrimaryDisplay(tsp: number): { tier: VolumePrimaryTier; text: string } {
  const x = Math.round(tsp * 1000) / 1000;
  if (x >= 48) {
    const cups = x / 48;
    if (Math.abs(cups - Math.round(cups)) < 0.06) {
      const n = Math.round(cups);
      return {
        tier: "cup",
        text: `${fmtQty(n)} cup${n === 1 ? "" : "s"}`,
      };
    }
    const whole = Math.floor(x / 48);
    const rem = x - whole * 48;
    const tb = rem / 3;
    const parts: string[] = [];
    if (whole > 0) {
      parts.push(`${fmtQty(whole)} cup${whole === 1 ? "" : "s"}`);
    }
    if (tb >= 0.05) {
      parts.push(`${fmtQty(tb)} tbsp`);
    }
    return {
      tier: "cup",
      text: parts.join(" + ") || `${fmtQty(cups)} cups`,
    };
  }
  if (isNiceCupFractionTsp(x)) {
    return { tier: "cup", text: formatCupsFromTsp(x) };
  }
  if (x >= 3) {
    return {
      tier: "tbsp",
      text: `${fmtQty(x / 3)} tbsp`,
    };
  }
  return { tier: "tsp", text: `${fmtQty(x)} tsp` };
}

/** Which unit scale the primary weight display uses (parentheses show only the other). */
export type WeightPrimaryTier = "oz" | "lb";

function weightPrimaryDisplay(oz: number): { tier: WeightPrimaryTier; text: string } {
  const r = Math.round(oz * 100) / 100;
  if (r >= 16) {
    const lbs = r / 16;
    if (Math.abs(lbs - Math.round(lbs)) < 0.06) {
      const n = Math.round(lbs);
      return { tier: "lb", text: `${fmtQty(n)} lb${n === 1 ? "" : "s"}` };
    }
    return { tier: "lb", text: `${fmtQty(lbs)} lb` };
  }
  return { tier: "oz", text: `${fmtQty(r)} oz` };
}

function normCountUnit(u: string): string {
  const n = normUnit(u);
  const plural: Record<string, string> = {
    clove: "cloves",
    container: "containers",
    box: "boxes",
    bunch: "bunches",
    pack: "packs",
    pouch: "pouches",
    steak: "steaks",
    piece: "pieces",
    slice: "slices",
    pepper: "peppers",
    peppers: "peppers",
  };
  return plural[n] ?? n;
}

function formatCount(amount: number, unit: string): string {
  const u = normCountUnit(unit);
  const a = Math.round(amount * 10000) / 10000;
  const amt = fmtQty(a);
  if (u === "each") {
    return `${amt} each`;
  }
  if (Math.abs(a - 1) < 0.001) {
    const sing = u.endsWith("s") ? u.slice(0, -1) : u;
    return `${amt} ${sing}`;
  }
  const pl = u.endsWith("s") ? u : `${u}s`;
  return `${amt} ${pl}`;
}

export interface IngredientBreakdown {
  recipeId: string;
  title: string;
  items: string[];
}

/** One row on the combined shopping list (merge output). */
export type CombinedShoppingItem =
  | { kind: "volume"; line: string; tsp: number; volumeTier: VolumePrimaryTier }
  | { kind: "weight"; line: string; oz: number; weightTier: WeightPrimaryTier }
  | { kind: "count"; line: string }
  | { kind: "raw"; line: string };

/**
 * Extra volume equivalents for the shopping list. Never mixes scale groups
 * (tsp+tbsp vs cup+qt). Parentheses show only the complementary unit, not the primary.
 */
export function formatVolumeConversions(
  tsp: number,
  primaryTier: VolumePrimaryTier,
): string {
  if (!Number.isFinite(tsp) || tsp < 0) {
    return "";
  }
  if (primaryTier === "cup") {
    const qt = tsp / 192; // 4 cups / quart → 192 tsp / quart
    return `${fmtQty(qt)} qt`;
  }
  if (primaryTier === "tbsp") {
    return `${fmtQty(tsp)} tsp`;
  }
  const tbsp = tsp / 3;
  return `${fmtQty(tbsp)} tbsp`;
}

/** US weight: complementary unit only (oz primary → lb; lb primary → oz). */
export function formatWeightConversions(
  oz: number,
  primaryTier: WeightPrimaryTier,
): string {
  if (!Number.isFinite(oz) || oz < 0) {
    return "";
  }
  if (primaryTier === "oz") {
    return `${fmtQty(oz / 16)} lb`;
  }
  return `${fmtQty(oz)} oz`;
}

function collectLines(
  recipe: Recipe,
  byId: Map<string, IngredientDef>,
): string[] {
  const out: string[] = [];
  for (const sec of recipe.ingredientSections ?? []) {
    for (const line of sec.lines) {
      out.push(formatIngredientLine(line, byId));
    }
  }
  return out;
}

type Bucket =
  | { kind: "volume"; name: string; ingredientId: string; tsp: number }
  | { kind: "weight"; name: string; ingredientId: string; oz: number }
  | { kind: "count"; name: string; ingredientId: string; amount: number; unit: string }
  | { kind: "raw"; text: string };

function lineToBucket(
  line: RecipeIngredientLine,
  byId: Map<string, IngredientDef>,
): Bucket | null {
  const def = byId.get(line.ingredientId);
  if (!def) {
    return {
      kind: "raw",
      text: formatIngredientLine(line, byId),
    };
  }

  if (line.amount == null || line.unit == null) {
    return {
      kind: "raw",
      text: formatIngredientLine(line, byId),
    };
  }

  const k = def.kind as IngredientKind;
  if (k === "volume") {
    const tsp = toVolumeBase(line.amount, line.unit);
    if (Number.isNaN(tsp)) {
      return {
        kind: "raw",
        text: formatIngredientLine(line, byId),
      };
    }
    return {
      kind: "volume",
      name: def.name,
      ingredientId: def.id,
      tsp,
    };
  }

  if (k === "weight") {
    const oz = toWeightBase(line.amount, line.unit);
    if (Number.isNaN(oz)) {
      return {
        kind: "raw",
        text: formatIngredientLine(line, byId),
      };
    }
    return {
      kind: "weight",
      name: def.name,
      ingredientId: def.id,
      oz,
    };
  }

  if (k === "count") {
    return {
      kind: "count",
      name: def.name,
      ingredientId: def.id,
      amount: line.amount,
      unit: normCountUnit(line.unit),
    };
  }

  return {
    kind: "raw",
    text: formatIngredientLine(line, byId),
  };
}

/**
 * Build combined shopping list from selected recipes using library kinds + units.
 */
export function buildShoppingListData(
  recipesInOrder: Recipe[],
  allIngredients: IngredientDef[],
): {
  combinedItems: CombinedShoppingItem[];
  byRecipe: IngredientBreakdown[];
} {
  const byId = ingredientMap(allIngredients);

  const vol = new Map<string, { name: string; tsp: number }>();
  const wt = new Map<string, { name: string; oz: number }>();
  const ct = new Map<string, { name: string; amount: number; unit: string }>();
  const rawSeen = new Set<string>();
  const rawOrder: string[] = [];

  for (const recipe of recipesInOrder) {
    for (const sec of recipe.ingredientSections ?? []) {
      for (const line of sec.lines) {
        const b = lineToBucket(line, byId);
        if (b.kind === "raw") {
          const k = b.text.trim().toLowerCase().replace(/\s+/g, " ");
          if (!rawSeen.has(k)) {
            rawSeen.add(k);
            rawOrder.push(b.text);
          }
          continue;
        }
        if (b.kind === "volume") {
          const ex = vol.get(b.ingredientId);
          if (ex) {
            ex.tsp += b.tsp;
          } else {
            vol.set(b.ingredientId, { name: b.name, tsp: b.tsp });
          }
          continue;
        }
        if (b.kind === "weight") {
          const ex = wt.get(b.ingredientId);
          if (ex) {
            ex.oz += b.oz;
          } else {
            wt.set(b.ingredientId, { name: b.name, oz: b.oz });
          }
          continue;
        }
        const ckey = `${b.ingredientId}::${b.unit}`;
        const ex = ct.get(ckey);
        if (ex) {
          ex.amount += b.amount;
        } else {
          ct.set(ckey, { name: b.name, amount: b.amount, unit: b.unit });
        }
      }
    }
  }

  const mergedItems: CombinedShoppingItem[] = [];
  for (const { name, tsp } of vol.values()) {
    const { tier, text } = volumePrimaryDisplay(tsp);
    mergedItems.push({
      kind: "volume",
      line: `${name} - ${text}`,
      tsp,
      volumeTier: tier,
    });
  }
  for (const { name, oz } of wt.values()) {
    const { tier, text } = weightPrimaryDisplay(oz);
    mergedItems.push({
      kind: "weight",
      line: `${name} - ${text}`,
      oz,
      weightTier: tier,
    });
  }
  for (const { name, amount, unit } of ct.values()) {
    mergedItems.push({
      kind: "count",
      line: `${name} - ${formatCount(amount, unit)}`,
    });
  }

  mergedItems.sort((a, b) =>
    a.line.localeCompare(b.line, undefined, { sensitivity: "base" }),
  );

  const combinedItems: CombinedShoppingItem[] = [
    ...mergedItems,
    ...rawOrder.map((line) => ({ kind: "raw" as const, line })),
  ];

  const byRecipe: IngredientBreakdown[] = recipesInOrder.map((r) => ({
    recipeId: r.id,
    title: r.title,
    items: collectLines(r, byId),
  }));

  return { combinedItems, byRecipe };
}
