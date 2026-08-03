/**
 * Which ingredients are kitchen staples.
 *
 * A staple is something most kitchens keep on hand permanently — salt, oil, flour, vinegar. The
 * shopping list keeps these out of the main aisle groups so the list is only what you actually
 * need to buy, and collects them in a collapsed "Staples" tray you can pull items back out of.
 *
 * Deliberately a plain list in code rather than a DB column: the set is curated, not per-user,
 * so a column would only ever be a projection of this file — bought at the cost of running a
 * migration against every environment and drifting whenever one is missed. `/api/ingredients`
 * decorates each row with `staple` on read, so the list ships and deploys with the code.
 *
 * Underscore prefix = not a Vercel route, so this doesn't count toward the function limit.
 *
 * To adjust: edit the lists below and deploy. `node scripts/export-staples-csv.mjs` dumps the
 * whole catalog with its current flag for review in a spreadsheet.
 */

/** Whole categories where essentially every member is a standing pantry item. */
export const STAPLE_CATEGORIES = ['spices']

/**
 * Category members that are NOT staples despite the category being one.
 *
 * "Every spice is a staple" is right for salt and paprika and wrong for everything below. These
 * get bought for a specific dish rather than kept on hand, and wrongly hiding one fails in the
 * expensive direction — you don't find out until you're cooking and the curry paste isn't there.
 */
export const CATEGORY_EXCEPTIONS = new Set([
  // Bought per-recipe, not kept on hand.
  'curry-cubes',
  'curry-paste-yellow',
  // Branded products — you either bought that specific jar or you didn't.
  'franks-seasoning-blend',
  'grill-mates-spice',
  'mccormick-meatloaf-seasoning',
  'stubbs-rub',
  'old-bay',
  // Outside a typical American spice rack.
  'garam-masala',
  'tandoori-masala',
  'za-atar',
  'five-spice',
  'kasoori-methi',
  'cardamom-pods',
  // Single-dish blends and second-tier spices you buy for a recipe.
  'cajun-rub',
  'taco-seasoning',
  'everything-bagel-seasoning',
  'lemon-pepper',
  'curry-powder',
  'celery-salt',
  'onion-salt',
  'mustard-powder',
  'spice-mix-optional',
  // All three sesame variants are bought for a dish, not kept on hand — keep them together.
  'sesame-seeds',
  'white-sesame-seeds',
  'black-sesame-seeds',
])

/**
 * Individually curated staples from mixed categories.
 *
 * The genuinely always-present version of each thing: plain flour but not bread/almond/whole
 * wheat, no white sugar, one neutral oil plus olive oil but no speciality oils or vinegars, and
 * only the condiments that live in the fridge door permanently.
 */
export const STAPLE_IDS = new Set([
  // baking — leaveners and plain flour only
  'flour-all-purpose',
  'baking-powder',
  'baking-soda',
  // oils
  'olive-oil',
  'vegetable-oil',
  'pam-spray',
  // standing condiments
  'soy-sauce',
  'ketchup',
  'mayonnaise',
  'mustard-yellow',
  // pantry basics
  'honey',
  'maple-syrup',
  'peanut-butter',
  'breadcrumbs',
  'breadcrumbs-italian',
  'panko',
  // fridge basics — always in the door, never worth a line on the list
  'butter',
  'butter-unsalted',
  // water is not a grocery
  'water',
  'hot-water',
  'warm-water',
  'white-rice-water',
])

/** True when this ingredient should be kept off the main shopping list. */
export function isStaple(ingredient) {
  if (!ingredient || !ingredient.id) return false
  if (CATEGORY_EXCEPTIONS.has(ingredient.id)) return false
  if (STAPLE_CATEGORIES.includes(ingredient.category)) return true
  return STAPLE_IDS.has(ingredient.id)
}
