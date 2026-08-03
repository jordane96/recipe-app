/**
 * Client-side view of the tag vocabulary. Mirrors api/_tags.js, which is the source of truth for
 * normalisation on read/write — the server guarantees every tag reaching here is already canonical
 * (lowercase, hyphenated, in-vocabulary), so this module only has to group and label them.
 *
 * Storage stays slugged (`crock-pot`); only display is capitalised and de-hyphenated. Keeping that
 * split is what stops "Crock Pot" / "crock pot" / "Crock pot" becoming three distinct values again.
 */

export type TagFacet = { key: string; label: string; values: readonly string[] };

export const TAG_FACETS: readonly TagFacet[] = [
  { key: "course", label: "Course", values: ["main", "side"] },
  {
    key: "protein",
    label: "Protein",
    values: ["chicken", "beef", "pork", "turkey", "lamb", "seafood", "egg", "veggie"],
  },
  {
    key: "method",
    label: "Method",
    values: [
      "crock-pot", "pressure-cooker", "air-fryer", "grill", "smoker",
      "baked", "stovetop", "sous-vide", "no-cook",
    ],
  },
  {
    key: "cuisine",
    label: "Cuisine",
    values: [
      "italian", "french", "spanish", "greek", "german",
      "mexican", "caribbean", "american", "southern", "cajun",
      "indian", "thai", "chinese", "japanese", "korean", "vietnamese", "asian",
      "middle-eastern", "north-african", "lithuanian",
    ],
  },
  {
    key: "additional",
    label: "Additional Tags",
    values: [
      "quick", "one-pot", "meal-prep", "kid-friendly", "spicy",
      "vegan", "gluten-free", "dairy-free", "keto", "low-carb", "high-protein",
    ],
  },
];

/** Facets a user may extend. `course` is excluded — main/side is structural, not descriptive. */
export const EXTENSIBLE_FACETS = ["protein", "method", "cuisine", "additional"] as const;

/**
 * Slug -> display label: "crock-pot" becomes "Crock Pot", and a faceted custom tag
 * "cuisine:thai" becomes "Thai" — the facet is shown by which group the chip sits in, so
 * repeating it on the chip would be noise.
 */
export function tagLabel(slug: string): string {
  const bare = slug.includes(":") ? slug.slice(slug.indexOf(":") + 1) : slug;
  return bare.replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Group the tags actually present on the user's recipes into facet order, dropping empty facets.
 * Anything outside the vocabulary is collected under "Other" rather than silently hidden — the
 * server normaliser should prevent that, but a stale cache or a future tag shouldn't vanish.
 */
export function groupTagsByFacet(
  present: readonly string[],
): Array<{ key: string; label: string; values: string[] }> {
  const remaining = new Set(present);
  const groups: Array<{ key: string; label: string; values: string[] }> = [];
  for (const facet of TAG_FACETS) {
    const builtIn = facet.values.filter((v) => remaining.has(v));
    // Custom tags declare their facet in the slug ("cuisine:thai"), so they sort in beside the
    // built-in values of the same group rather than piling up under "Other".
    const custom = [...remaining]
      .filter((v) => v.startsWith(`${facet.key}:`))
      .sort((a, b) => a.localeCompare(b));
    const values = [...builtIn, ...custom];
    values.forEach((v) => remaining.delete(v));
    if (values.length > 0) {
      groups.push({ key: facet.key, label: facet.label, values });
    }
  }
  if (remaining.size > 0) {
    groups.push({ key: "other", label: "Other", values: [...remaining].sort((a, b) => a.localeCompare(b)) });
  }
  return groups;
}

/** Which facet a tag belongs to — used to OR within a facet and AND across facets. */
export function facetKeyOf(tag: string): string {
  if (tag.includes(":")) {
    const prefix = tag.slice(0, tag.indexOf(":"));
    if (TAG_FACETS.some((f) => f.key === prefix)) return prefix;
  }
  for (const facet of TAG_FACETS) {
    if (facet.values.includes(tag)) return facet.key;
  }
  return "other";
}
