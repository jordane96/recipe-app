export type RecipeType = "recipe" | "reference";

export interface RecipeSection {
  name: string;
  items: string[];
}

export interface Recipe {
  id: string;
  title: string;
  type: RecipeType;
  tags?: string[];
  sections?: RecipeSection[];
  instructions?: string[];
  sourceUrl?: string;
  notes?: string;
}

export interface RecipeFile {
  version: number;
  recipes: Recipe[];
}
