import type { Recipe } from "./types";

/** How a recipe is grouped on the list and shopping page. */
export type RecipeSegment = "main" | "side" | "other";

export function recipeSegment(r: Recipe): RecipeSegment {
  if (r.course === "side") {
    return "side";
  }
  if (r.course === "main") {
    return "main";
  }
  if (r.type === "reference") {
    return "other";
  }
  return "main";
}

export const SEGMENT_ORDER: RecipeSegment[] = ["main", "side", "other"];

export const SEGMENT_LABEL: Record<RecipeSegment, string> = {
  main: "Mains",
  side: "Sides",
  other: "Reference & tips",
};

export function segmentRank(s: RecipeSegment): number {
  return SEGMENT_ORDER.indexOf(s);
}
