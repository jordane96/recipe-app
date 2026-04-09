/** One row in a recipe; amounts use US units from the library. */
export interface RecipeIngredientLine {
  ingredientId: string;
  /** null = qualitative (e.g. drizzle, to taste) — not merged numerically */
  amount: number | null;
  unit: string | null;
  note?: string;
}

export interface IngredientSection {
  name: string;
  lines: RecipeIngredientLine[];
}

export type IngredientKind = "volume" | "weight" | "count" | "other";

export interface IngredientDef {
  id: string;
  name: string;
  kind: IngredientKind;
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

/** Library side recipe linked from a main (full instructions); optional shopping add. */
export interface RecommendedSideRef {
  recipeId: string;
  /** Short hint, e.g. why this maps from the written recipe */
  label?: string;
}

export interface Recipe {
  id: string;
  title: string;
  type: "recipe" | "reference";
  /** Optional: group on recipe list & shopping (default: main for recipes, other for reference). */
  course?: "main" | "side";
  tags?: string[];
  /** Structured shopping + display */
  ingredientSections: IngredientSection[];
  /** Curated links to course:side recipes (from recommendedSides.mjs). */
  recommendedSides?: RecommendedSideRef[];
  instructions?: string[];
  sourceUrl?: string;
  notes?: string;
}

export interface RecipeFile {
  version: number;
  recipes: Recipe[];
}

export interface RecipeBundle {
  ingredients: IngredientsFile;
  recipes: RecipeFile;
}
