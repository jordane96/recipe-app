/**
 * Closed tag vocabulary + normaliser. Single source of truth for the server side.
 *
 * Underscore prefix means Vercel does not treat this as a route (same trick as api/kroger/_kroger.js),
 * so it costs nothing against the 12-function Hobby limit.
 *
 * Tags are stored as one flat array on `recipes.tags` because that is what the app reads, but they
 * are conceptually faceted — see docs/tag-reconciliation.md. `course` is structural: recipeSegment()
 * drives planner card colours, sort order, cook history and shopping-list grouping off main/side.
 */

export const COURSES = ['main', 'side']
export const PROTEINS = ['chicken', 'beef', 'veggie', 'turkey', 'pork', 'seafood']
export const METHODS = ['crock-pot', 'air-fryer', 'grill', 'baked', 'stovetop']
export const CUISINES = [
  'italian', 'mexican', 'asian', 'indian', 'japanese',
  'greek', 'southern', 'middle-eastern', 'lithuanian',
]
export const ADDITIONAL = ['keto', 'meal-prep']

/** Display order and labels for the faceted filter UI. */
export const TAG_FACETS = [
  { key: 'course', label: 'Course', values: COURSES },
  { key: 'protein', label: 'Protein', values: PROTEINS },
  { key: 'method', label: 'Method', values: METHODS },
  { key: 'cuisine', label: 'Cuisine', values: CUISINES },
  { key: 'additional', label: 'Additional tags', values: ADDITIONAL },
]

export const ALL_TAGS = new Set([
  ...COURSES, ...PROTEINS, ...METHODS, ...CUISINES, ...ADDITIONAL,
])

/**
 * Legacy / variant spellings seen in the live data, mapped to canonical values.
 * Keys are already lowercased and whitespace-collapsed by the time they are looked up.
 */
const ALIASES = {
  'crock-pot': 'crock-pot',
  'crock pot': 'crock-pot',
  crockpot: 'crock-pot',
  'slow-cooker': 'crock-pot',
  'slow cooker': 'crock-pot',
  'air-fryer': 'air-fryer',
  'air fryer': 'air-fryer',
  airfryer: 'air-fryer',
  'italian-american': 'italian',
  bake: 'baked',
  baking: 'baked',
  roasted: 'baked',
  vegetables: 'veggie',
  vegetable: 'veggie',
  veggies: 'veggie',
  vegetarian: 'veggie',
  freezer: 'meal-prep',
  'meal prep': 'meal-prep',
  mealprep: 'meal-prep',
  salmon: 'seafood',
  fish: 'seafood',
}

/** Retired tags: recognised, but deliberately dropped rather than kept as custom values. */
const RETIRED = new Set(['soup', 'appetizer', 'dish', 'other'])

/**
 * Canonicalise a single raw tag. Returns null for empties and retired tags.
 *
 * Values outside the built-in vocabulary are KEPT if they are well-formed, so users can add their
 * own (e.g. "thai") without the server silently swallowing them. That is safe because the thing
 * that actually caused duplicate chips was inconsistent *form* — "Crock Pot" / "crock pot" /
 * "crock-pot" — and every one of those still collapses to a single slug here. The AI importer
 * cannot invent values regardless; it is constrained by z.enum in parse.js.
 */
export function normalizeTag(raw) {
  if (typeof raw !== 'string') return null
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/^-+|-+$/g, '')
  if (!cleaned) return null
  const aliased = ALIASES[cleaned] ?? cleaned.replace(/ /g, '-').replace(/-{2,}/g, '-')
  if (ALL_TAGS.has(aliased)) return aliased
  if (RETIRED.has(aliased)) return null
  // Custom tag: keep it, but only in a shape that can never collide by case or spacing.
  return /^[a-z0-9][a-z0-9-]{1,23}$/.test(aliased) ? aliased : null
}

/**
 * Canonicalise a whole tag list: alias-mapped, de-duplicated, unknown values dropped, and sorted
 * into facet order so the stored/returned array is stable regardless of input order.
 */
export function normalizeTags(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  for (const raw of list) {
    const t = normalizeTag(raw)
    if (t) seen.add(t)
  }
  const ordered = []
  for (const facet of TAG_FACETS) {
    for (const value of facet.values) {
      if (seen.has(value)) {
        ordered.push(value)
        seen.delete(value)
      }
    }
  }
  // Whatever is left is a user-added custom tag — keep it, after the known facets.
  return [...ordered, ...[...seen].sort((a, b) => a.localeCompare(b))]
}
