import {
  MEAL_PLAN_UNASSIGNED_KEY,
  newPlanSlotRef,
  sortMealsMainBeforeSide,
  type MealPlanByDate,
  type PlannedMeal,
} from "./mealPlanStorage";
import type { Recipe } from "./types";

/**
 * The starter week a brand-new account opens on.
 *
 * The recipe library is public, so a new user already has ~65 recipes to browse — but "My menu"
 * is per-device local state and starts empty, which is the *first* thing they see. For a visitor
 * arriving from a resume link that empty screen is the whole first impression, so we plant a few
 * days of meals that show the product working end to end (a plan → a shopping list → cook mode).
 *
 * Hand-picked by Jordan: two mains and a side, kept deliberately short so the first screen reads
 * as a real week someone planned rather than a catalogue dump.
 *
 * They land in the **unassigned menu pool**, not on calendar days: that's the pool "My menu"
 * renders, it's where the app's own "add meal" flow puts things, and it leaves the drag-onto-a-day
 * step for the visitor to discover. Seeding both would double-count every ingredient, since
 * `flattenPlanRecipeIdsInOrder` walks the calendar *and* the pool.
 */
const STARTER_MEALS: ReadonlyArray<{ id: string; kind: PlannedMeal["kind"] }> = [
  { id: "chicken-parmesan", kind: "main" },
  // The library has no turkey meatloaf — `soy-glazed-meatloaf` is the only meatloaf in it.
  { id: "soy-glazed-meatloaf", kind: "main" },
  { id: "air-fry-brussels-sprouts", kind: "side" },
];

/**
 * Recipes a new account starts with **saved**, i.e. what its "Recipes" tab contains.
 *
 * This is separate from the menu above and it matters more than it looks: the Recipes tab lists
 * only recipes *you have saved*, not the whole public library. A fresh account has no saves, so
 * without this the tab reads "No recipes yet." and the 71 public recipes are reachable only by
 * finding the Discover button. For a visitor arriving from a resume link, that's an empty app.
 *
 * Chosen to spread across the tag facets so the filters have something to bite on — five
 * proteins (chicken, beef, turkey, seafood, veggie) and five methods (baked, stovetop, crock-pot,
 * air-fryer, grill) — rather than to be a "best of". Superset of {@link STARTER_MEALS}: a meal
 * sitting on your menu that isn't in your recipes would be odd.
 */
const STARTER_LIBRARY: readonly string[] = [
  // Mains
  "chicken-parmesan",
  "soy-glazed-meatloaf",
  "chicken-piccata",
  "butter-chicken",
  "barbacoa",
  "miso-salmon",
  "turkey-chili",
  "grilled-tri-tip",
  "chicken-katsu-curry",
  // Sides
  "air-fry-brussels-sprouts",
  "mashed-potatoes",
  "regular-rice",
  "garlic-bread",
];

/**
 * The starter library, filtered to recipes that actually exist and are visible. Ids are resolved
 * against the live list so a renamed or deleted recipe silently drops out instead of producing a
 * save row pointing at nothing.
 */
export function starterSavedRecipeIds(recipes: readonly Recipe[]): string[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return STARTER_LIBRARY.filter((id) => {
    const r = byId.get(id);
    return Boolean(r && r.visibility !== "private");
  });
}

/**
 * Recipes that shouldn't be offered as a fallback pick: scratch rows and near-duplicates that
 * would make a curated week look accidental.
 */
const FALLBACK_EXCLUDED = new Set(["test-recipe"]);

function plannedMeal(recipe: Recipe, kind: PlannedMeal["kind"]): PlannedMeal {
  return {
    id: recipe.id,
    title: recipe.title,
    kind,
    planSlotRef: newPlanSlotRef(),
    portionCount: 1,
  };
}

/**
 * Build the starter plan against the recipes actually available. Curated ids are looked up by id
 * and silently skipped when a recipe has been renamed or removed, then topped up from the library
 * by tag — so this can never seed a plan pointing at recipes that no longer exist.
 */
export function buildStarterPlan(recipes: readonly Recipe[]): MealPlanByDate {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const usable = (r: Recipe) => !FALLBACK_EXCLUDED.has(r.id) && r.visibility !== "private";
  const pool = (tag: string) =>
    recipes.filter((r) => usable(r) && (r.tags ?? []).includes(tag));

  const usedIds = new Set<string>();
  const takeFallback = (tag: string): Recipe | undefined => {
    const pick = pool(tag).find((r) => !usedIds.has(r.id));
    if (pick) usedIds.add(pick.id);
    return pick;
  };
  const take = (id: string | undefined, tag: string): Recipe | undefined => {
    const exact = id ? byId.get(id) : undefined;
    if (exact && usable(exact) && !usedIds.has(exact.id)) {
      usedIds.add(exact.id);
      return exact;
    }
    return takeFallback(tag);
  };

  const meals: PlannedMeal[] = [];
  for (const entry of STARTER_MEALS) {
    const recipe = take(entry.id, entry.kind);
    if (recipe) meals.push(plannedMeal(recipe, entry.kind));
  }
  return meals.length > 0
    ? { [MEAL_PLAN_UNASSIGNED_KEY]: sortMealsMainBeforeSide(meals) }
    : {};
}
