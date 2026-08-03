import type {
  IngredientCategory,
  IngredientDef,
  IngredientKind,
  Recipe,
  RecipeIngredientLine,
} from "./ingredientTypes";
import { INGREDIENT_CATEGORY_ORDER, TO_TASTE_UNIT } from "./ingredientTypes";
import {
  formatIngredientLine,
  formatQuantityDisplay,
  ingredientMapWithRecipes,
} from "./ingredientDisplay";

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

const PLURAL_BY_SINGULAR: Record<string, string> = {
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
  pinch: "pinches",
  strip: "strips",
  sprig: "sprigs",
  head: "heads",
  stalk: "stalks",
  can: "cans",
};

/**
 * Reverse of PLURAL_BY_SINGULAR. Needed because trimming a trailing "s" turns
 * "-es" plurals into nonsense ("pouches" -> "pouche"). Identity entries are
 * skipped so "peppers" resolves back to "pepper" rather than to itself.
 */
const SINGULAR_BY_PLURAL: Record<string, string> = {};
for (const [singular, plural] of Object.entries(PLURAL_BY_SINGULAR)) {
  if (singular !== plural) SINGULAR_BY_PLURAL[plural] = singular;
}

function normCountUnit(u: string): string {
  const n = normUnit(u);
  return PLURAL_BY_SINGULAR[n] ?? n;
}

function formatCount(amount: number, unit: string): string {
  const u = normCountUnit(unit);
  const a = Math.round(amount * 10000) / 10000;
  const amt = fmtQty(a);
  if (u === "each") {
    return `${amt} each`;
  }
  if (Math.abs(a - 1) < 0.001) {
    const sing = SINGULAR_BY_PLURAL[u] ?? (u.endsWith("s") ? u.slice(0, -1) : u);
    return `${amt} ${sing}`;
  }
  const pl = u.endsWith("s") ? u : `${u}s`;
  return `${amt} ${pl}`;
}

export interface IngredientBreakdown {
  /** Stable key for this list slot (same recipeId may appear multiple times). */
  instanceKey: string;
  recipeId: string;
  title: string;
  items: string[];
}

/** One row on the combined shopping list (merge output). */
export type CombinedShoppingItem =
  | {
      kind: "volume";
      line: string;
      tsp: number;
      volumeTier: VolumePrimaryTier;
      /** Recipe ids that contributed to this merged line. */
      sourceRecipeIds: readonly string[];
      /** Grocery section (from ingredient library). */
      category: IngredientCategory;
      /** Distinct prep notes from the contributing recipe lines (e.g. "chopped", "divided"). */
      notes: readonly string[];
      /** Catalog id behind this line; absent only for truly unknown ingredients. */
      ingredientId?: string;
    }
  | {
      kind: "weight";
      line: string;
      oz: number;
      weightTier: WeightPrimaryTier;
      sourceRecipeIds: readonly string[];
      category: IngredientCategory;
      notes: readonly string[];
      ingredientId?: string;
    }
  | {
      kind: "count";
      line: string;
      sourceRecipeIds: readonly string[];
      category: IngredientCategory;
      notes: readonly string[];
      ingredientId?: string;
    }
  | {
      kind: "raw";
      line: string;
      sourceRecipeIds: readonly string[];
      /** Qualitative / unknown ingredient lines. */
      category: IngredientCategory;
      notes: readonly string[];
      ingredientId?: string;
    };

function sortedIds(ids: Set<string>): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function categoryRank(category: IngredientCategory): number {
  const i = INGREDIENT_CATEGORY_ORDER.indexOf(category);
  return i >= 0 ? i : INGREDIENT_CATEGORY_ORDER.length;
}

function sortCombinedBySectionThenLine(items: CombinedShoppingItem[]): void {
  items.sort((a, b) => {
    const d = categoryRank(a.category) - categoryRank(b.category);
    if (d !== 0) {
      return d;
    }
    return a.line.localeCompare(b.line, undefined, { sensitivity: "base" });
  });
}

/** Distinct combined-list line strings this recipe contributed to (for purchased UI). */
export function combinedLinesContributedByRecipe(
  items: CombinedShoppingItem[],
  recipeId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item.sourceRecipeIds.includes(recipeId)) {
      continue;
    }
    if (seen.has(item.line)) {
      continue;
    }
    seen.add(item.line);
    out.push(item.line);
  }
  return out;
}

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

/** Return a copy of the line with its amount multiplied by `scale` (null amounts pass through). */
function scaleLine(line: RecipeIngredientLine, scale: number): RecipeIngredientLine {
  if (scale === 1 || line.amount == null) return line;
  return { ...line, amount: line.amount * scale };
}

function collectLines(
  recipe: Recipe,
  byId: Map<string, IngredientDef>,
  scale: number,
): string[] {
  const out: string[] = [];
  for (const sec of recipe.ingredientSections ?? []) {
    for (const line of sec.lines) {
      out.push(formatIngredientLine(scaleLine(line, scale), byId));
    }
  }
  return out;
}

type Bucket =
  | { kind: "volume"; name: string; ingredientId: string; tsp: number }
  | { kind: "weight"; name: string; ingredientId: string; oz: number }
  | { kind: "count"; name: string; ingredientId: string; amount: number; unit: string }
  /** Qualitative / unmergeable lines. Carry ingredientId when we know it so the consumer
   *  can still recover the catalog category (e.g. unit-kind mismatches still group in Produce
   *  instead of "Other"). */
  | { kind: "raw"; text: string; ingredientId?: string };

/**
 * Which measurement family a *unit* belongs to.
 *
 * Deliberately keyed off the unit on the line rather than the ingredient's catalog `kind`.
 * Real recipes measure the same ingredient different ways — cheese by the cup in one and by
 * the ounce in another, parsley by the bunch, bacon by the strip — and keying off the catalog
 * meant any line that disagreed with it fell through to an unmergeable raw string. Anything
 * that isn't a known volume or weight unit is a count ("2 bunches", "3 strips", "1 pinch").
 */
function unitKind(unit: string): IngredientKind {
  const u = normUnit(unit);
  if (VOL_TO_TSP[u] !== undefined) {
    return "volume";
  }
  if (WT_TO_OZ[u] !== undefined) {
    return "weight";
  }
  return "count";
}

function lineToBucket(line: RecipeIngredientLine, byId: Map<string, IngredientDef>): Bucket {
  const def = byId.get(line.ingredientId);
  if (!def) {
    return {
      kind: "raw",
      text: formatIngredientLine(line, byId, false),
      ingredientId: line.ingredientId,
    };
  }

  // No amount, no unit, or an explicitly qualitative line ("to taste") — nothing to merge.
  if (line.amount == null || line.unit == null || normUnit(line.unit) === TO_TASTE_UNIT) {
    return {
      kind: "raw",
      text: formatIngredientLine(line, byId, false),
      ingredientId: def.id,
    };
  }

  const k = unitKind(line.unit);
  if (k === "volume") {
    return {
      kind: "volume",
      name: def.name,
      ingredientId: def.id,
      tsp: toVolumeBase(line.amount, line.unit),
    };
  }

  if (k === "weight") {
    return {
      kind: "weight",
      name: def.name,
      ingredientId: def.id,
      oz: toWeightBase(line.amount, line.unit),
    };
  }

  return {
    kind: "count",
    name: def.name,
    ingredientId: def.id,
    amount: line.amount,
    unit: normCountUnit(line.unit),
  };
}

/**
 * Build combined shopping list from selected recipes using library kinds + units.
 *
 * Each entry carries a `scale` (= target servings ÷ recipe base servings); every ingredient
 * amount for that recipe is multiplied by it before merging. Pass scale 1 for no scaling.
 */
export function buildShoppingListData(
  entries: Array<{ recipe: Recipe; scale: number }>,
  allIngredients: IngredientDef[],
): {
  combinedItems: CombinedShoppingItem[];
  byRecipe: IngredientBreakdown[];
} {
  // Include recipe-scoped customIngredientDefs so a recipe using e.g. "custom-spinach"
  // resolves to its human name on the combined list instead of leaking the raw id.
  const byId = ingredientMapWithRecipes(
    allIngredients,
    entries.map((e) => e.recipe),
  );

  const vol = new Map<
    string,
    { name: string; tsp: number; recipeIds: Set<string>; notes: Set<string> }
  >();
  const wt = new Map<
    string,
    { name: string; oz: number; recipeIds: Set<string>; notes: Set<string> }
  >();
  const ct = new Map<
    string,
    { name: string; amount: number; unit: string; recipeIds: Set<string>; notes: Set<string> }
  >();
  const rawMap = new Map<
    string,
    { line: string; recipeIds: Set<string>; ingredientId?: string; notes: Set<string> }
  >();
  const rawOrderKeys: string[] = [];

  for (const { recipe, scale } of entries) {
    for (const sec of recipe.ingredientSections ?? []) {
      for (const line of sec.lines) {
        const b = lineToBucket(line, byId);
        const note = line.note?.trim();
        // Scale measurable amounts by this recipe's servings multiple before merging.
        if (scale !== 1) {
          if (b.kind === "volume") b.tsp *= scale;
          else if (b.kind === "weight") b.oz *= scale;
          else if (b.kind === "count") b.amount *= scale;
        }
        if (b.kind === "raw") {
          const k = b.text.trim().toLowerCase().replace(/\s+/g, " ");
          let ex = rawMap.get(k);
          if (!ex) {
            ex = { line: b.text, recipeIds: new Set(), ingredientId: b.ingredientId, notes: new Set() };
            rawMap.set(k, ex);
            rawOrderKeys.push(k);
          } else if (!ex.ingredientId && b.ingredientId) {
            ex.ingredientId = b.ingredientId;
          }
          ex.recipeIds.add(recipe.id);
          if (note) ex.notes.add(note);
          continue;
        }
        if (b.kind === "volume") {
          const ex = vol.get(b.ingredientId);
          if (ex) {
            ex.tsp += b.tsp;
            ex.recipeIds.add(recipe.id);
            if (note) ex.notes.add(note);
          } else {
            vol.set(b.ingredientId, {
              name: b.name,
              tsp: b.tsp,
              recipeIds: new Set([recipe.id]),
              notes: new Set(note ? [note] : []),
            });
          }
          continue;
        }
        if (b.kind === "weight") {
          const ex = wt.get(b.ingredientId);
          if (ex) {
            ex.oz += b.oz;
            ex.recipeIds.add(recipe.id);
            if (note) ex.notes.add(note);
          } else {
            wt.set(b.ingredientId, {
              name: b.name,
              oz: b.oz,
              recipeIds: new Set([recipe.id]),
              notes: new Set(note ? [note] : []),
            });
          }
          continue;
        }
        const ckey = `${b.ingredientId}::${b.unit}`;
        const ex = ct.get(ckey);
        if (ex) {
          ex.amount += b.amount;
          ex.recipeIds.add(recipe.id);
          if (note) ex.notes.add(note);
        } else {
          ct.set(ckey, {
            name: b.name,
            amount: b.amount,
            unit: b.unit,
            recipeIds: new Set([recipe.id]),
            notes: new Set(note ? [note] : []),
          });
        }
      }
    }
  }

  const sortedNotes = (notes: Set<string>): string[] =>
    [...notes].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const mergedItems: CombinedShoppingItem[] = [];
  for (const [ingredientId, { name, tsp, recipeIds, notes }] of vol.entries()) {
    const def = byId.get(ingredientId);
    const category: IngredientCategory = def?.category ?? "other";
    const { tier, text } = volumePrimaryDisplay(tsp);
    mergedItems.push({
      kind: "volume",
      line: `${name} - ${text}`,
      tsp,
      volumeTier: tier,
      sourceRecipeIds: sortedIds(recipeIds),
      category,
      notes: sortedNotes(notes),
      ingredientId,
    });
  }
  for (const [ingredientId, { name, oz, recipeIds, notes }] of wt.entries()) {
    const def = byId.get(ingredientId);
    const category: IngredientCategory = def?.category ?? "other";
    const { tier, text } = weightPrimaryDisplay(oz);
    mergedItems.push({
      kind: "weight",
      line: `${name} - ${text}`,
      oz,
      weightTier: tier,
      sourceRecipeIds: sortedIds(recipeIds),
      category,
      notes: sortedNotes(notes),
      ingredientId,
    });
  }
  for (const [ckey, { name, amount, unit, recipeIds, notes }] of ct.entries()) {
    const ingredientId = ckey.split("::")[0]!;
    const def = byId.get(ingredientId);
    const category: IngredientCategory = def?.category ?? "other";
    mergedItems.push({
      kind: "count",
      line: `${name} - ${formatCount(amount, unit)}`,
      sourceRecipeIds: sortedIds(recipeIds),
      category,
      notes: sortedNotes(notes),
      ingredientId,
    });
  }

  const rawItems: CombinedShoppingItem[] = rawOrderKeys.map((k) => {
    const ex = rawMap.get(k)!;
    // Preserve the ingredient's catalog category for unit-mismatched / qualitative lines —
    // otherwise a recipe using spinach by oz (while catalog says volume) lands in "Other"
    // instead of Produce. Falls back to "other" only when the ingredient is truly unknown.
    const def = ex.ingredientId ? byId.get(ex.ingredientId) : undefined;
    return {
      kind: "raw" as const,
      line: ex.line,
      sourceRecipeIds: sortedIds(ex.recipeIds),
      category: (def?.category ?? "other") as IngredientCategory,
      notes: sortedNotes(ex.notes),
      ...(ex.ingredientId ? { ingredientId: ex.ingredientId } : {}),
    };
  });

  const combinedItems: CombinedShoppingItem[] = [...mergedItems, ...rawItems];
  sortCombinedBySectionThenLine(combinedItems);

  const byRecipe: IngredientBreakdown[] = entries.map(({ recipe: r, scale }, instanceIndex) => ({
    instanceKey: `${r.id}@${instanceIndex}`,
    recipeId: r.id,
    title: r.title,
    items: collectLines(r, byId, scale),
  }));

  return { combinedItems, byRecipe };
}
