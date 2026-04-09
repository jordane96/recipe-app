/**
 * Maps a main (or any) recipe id → library side recipes that carry full instructions.
 * Curated from Side/Sides sections and obvious optional-starch lines (e.g. rice with mains).
 *
 * Only reference recipe ids with course: "side" in legacy-recipes-v1.json.
 * To extend: add an entry here, then run npm run data:publish.
 *
 * Not mapped (no matching side recipe in library yet):
 * - mozzarella-crusted-chicken (couscous-or-pasta + carrots)
 * - dijon-onion-chicken (green beans only — garlic-bread is mapped)
 *
 * Soy glazed meatloaf: roasted potatoes are **sliced potatoes** (separate side), not mashed.
 */

/** @typedef {{ recipeId: string, label?: string }} RecommendedSideEntry */

/** @type {Record<string, RecommendedSideEntry[]>} */
export const RECOMMENDED_SIDES = {
  "chicken-katsu-curry": [
    { recipeId: "regular-rice", label: "Rice (recipe uses dry rice)" },
  ],
  chili: [{ recipeId: "garlic-bread" }],
  "curry-peanut-chicken": [
    { recipeId: "regular-rice", label: "Rice (recipe suggests cooked rice)" },
  ],
  "dijon-onion-chicken": [
    { recipeId: "garlic-bread", label: "Garlic bread (also green beans in recipe)" },
  ],
  "lemon-italian-chicken-spaghetti": [
    { recipeId: "lemon-spaghetti", label: "Lemon spaghetti (pasta side)" },
  ],
  "miso-salmon": [
    { recipeId: "fried-rice", label: "Fried rice (optional in recipe)" },
  ],
  "soy-glazed-meatloaf": [
    {
      recipeId: "sliced-potatoes",
      label: "Roasted sliced/diced potatoes (same pan timing as meatloaf)",
    },
  ],
  "steak-spicy-soy-sauce": [
    { recipeId: "regular-rice", label: "Rice (with bok choy / carrots optional)" },
  ],
  "steak-jam-honey-mustard-sauce": [
    {
      recipeId: "lemon-panko-burrata-salad",
      label: "Salad (lemon panko burrata)",
    },
  ],
  "taco-chicken-crock-pot": [
    { recipeId: "regular-rice", label: "Rice (optional side in recipe)" },
  ],
};
