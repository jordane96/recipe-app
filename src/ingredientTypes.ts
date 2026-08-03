/** One row in a recipe; amounts use US units from the library. */
export interface RecipeIngredientLine {
  ingredientId: string;
  /** null = qualitative (e.g. drizzle, to taste) — not merged numerically */
  amount: number | null;
  unit: string | null;
  note?: string;
  /** Set by the parse agent for low-confidence matches; surfaced as an inline "verify" alert in the editor. Ephemeral — not persisted to the DB. */
  potentialMatch?: boolean;
}

export interface IngredientSection {
  name: string;
  lines: RecipeIngredientLine[];
}

export type IngredientKind = "volume" | "weight" | "count" | "other";

/**
 * Sentinel "unit" for amount-less seasoning lines (salt, pepper, oil drizzle, …). Listed among the
 * volume units so it's pickable in the unit dropdown for measurable ingredients without having to
 * reclassify the ingredient itself. A line using it stores `amount: null` and is treated as
 * qualitative everywhere (display, shopping merge, servings scaling).
 */
export const TO_TASTE_UNIT = "to taste";

export type IngredientCategory =
  | "produce"
  | "proteins"
  | "dairy"
  | "pantry"
  | "spices"
  | "oils-sauces"
  | "baking"
  | "other";

export interface IngredientDef {
  id: string;
  name: string;
  unit: IngredientKind;
  category: IngredientCategory;
  /**
   * Standing pantry item (salt, oil, flour…). Kept out of the shopping list's main aisle
   * groups so the list stays about what you actually need to buy; surfaced in a collapsed
   * "already have these?" tray instead. Seeded by `scripts/migrate-staples.mjs`.
   */
  staple?: boolean;
}

export interface IngredientsFile {
  version: number;
  units: {
    volume: string[];
    weight: string[];
    count: string[];
  };
  ingredients: IngredientDef[];
}

/** Store / recipe-editor order — reuse for shopping list aisle grouping. */
export const INGREDIENT_CATEGORY_ORDER: readonly IngredientCategory[] = [
  "produce",
  "proteins",
  "dairy",
  "pantry",
  "spices",
  "oils-sauces",
  "baking",
  "other",
] as const;

/** Display label for a grocery section / ingredient category. */
export function grocerySectionLabel(category: IngredientCategory): string {
  const labels: Record<IngredientCategory, string> = {
    produce: "Produce",
    proteins: "Protein",
    dairy: "Dairy",
    pantry: "Pantry",
    spices: "Spices",
    "oils-sauces": "Oils-sauces",
    baking: "Baking",
    other: "Other",
  };
  return labels[category];
}

/** Library side recipe linked from a main (full instructions); optional shopping add. */
export interface RecommendedSideRef {
  recipeId: string;
  /** Short hint, e.g. why this maps from the written recipe */
  label?: string;
}

/** One instruction line; string form is legacy. */
export type RecipeInstructionStep =
  | string
  | {
      text: string;
      durationSeconds?: number;
      /** Display-only labels for this step (e.g. composite “sauce”); not tied to shopping IDs. */
      stepIngredients?: string[];
      /** Optional tip/context under the main step line (detail + cook mode; not used for recipe list search). */
      note?: string;
    };

export interface Recipe {
  id: string;
  title: string;
  /** Username of the recipe owner. */
  owner?: string;
  /** If this is a fork, the id of the original recipe. */
  forkedFromRecipeId?: string;
  /** 'public' or 'private' */
  visibility?: string;
  /** Short intro or blurb shown on recipe detail (optional). */
  description?: string;
  /** Library attribution (e.g. who added the recipe); optional until backfilled. */
  createdBy?: string;
  /** Yield in servings; `null` when unknown. */
  servings?: number | null;
  type: "recipe" | "reference";
  tags?: string[];
  /** Structured shopping + display */
  ingredientSections: IngredientSection[];
  /**
   * Editor-only / local draft: ingredients created in “Add ingredient” that are not in the
   * global `ingredients.json`. Merged with the bundle when resolving lines on the edit screen.
   */
  customIngredientDefs?: IngredientDef[];
  /** Curated links to course:side recipes (from recommendedSides.mjs). */
  recommendedSides?: RecommendedSideRef[];
  instructions?: RecipeInstructionStep[];
  /** Optional total active cook time for cook-mode header (minutes). */
  totalCookTimeMinutes?: number;
  sourceUrl?: string;
  notes?: string;
}

export interface RecipeFile {
  version: number;
  recipes: Recipe[];
  /** Recipe IDs the current user has saved (per the ?user=… query param). */
  savedRecipeIds?: string[];
}

export interface RecipeBundle {
  ingredients: IngredientsFile;
  recipes: RecipeFile;
}
