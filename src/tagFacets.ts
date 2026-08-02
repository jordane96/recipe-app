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
  { key: "protein", label: "Protein", values: ["chicken", "beef", "veggie", "turkey", "pork", "seafood"] },
  { key: "method", label: "Method", values: ["crock-pot", "air-fryer", "grill", "baked", "stovetop"] },
  {
    key: "cuisine",
    label: "Cuisine",
    values: ["italian", "mexican", "asian", "indian", "japanese", "greek", "southern", "middle-eastern", "lithuanian"],
  },
  { key: "additional", label: "Additional Tags", values: ["keto", "meal-prep"] },
];

/** Slug -> display label: "crock-pot" becomes "Crock Pot". */
export function tagLabel(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
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
    const values = facet.values.filter((v) => remaining.has(v));
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
  for (const facet of TAG_FACETS) {
    if (facet.values.includes(tag)) return facet.key;
  }
  return "other";
}
