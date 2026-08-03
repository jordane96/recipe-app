# Recipe variants, and the two recipes that need splitting

Backlog items (all P1):
- *"Split meatloaf into multiple recipes"*
- *"Split up air fryer chicken between Italian seasoning and Cajun rub. Think through how to
  support recipe variants where main change is the sauce etc."*
- *"Investigate recipe structure and how mains vs sides are listed. Some recipes have sides within
  mains and 'recommended sides' that we should build formal functionality for"*

They're the same problem wearing three hats, so they're answered together here.

---

## The actual defect

Both recipes encode two dishes in one record, and the **shopping list is what breaks.**

### `chicken-air-fried` — "Chicken (air fried)"

One section, `Optional spice mix`, holds *both* rubs:

| ingredient | amount |
|---|---|
| italian-seasoning | 1 tbsp |
| garlic-powder | 1 tsp |
| paprika | ½ tsp |
| salt-and-pepper | 1 tsp |
| **cajun-rub** | 1 tbsp |

The first four are the Italian rub; the fifth is the entire Cajun alternative. Add this to your
menu and the list tells you to buy **both**, and cook mode reads out both. The word "Optional" in
the section name is the only thing carrying the distinction, and nothing in the app reads it.

### `soy-glazed-meatloaf` — "Soy glazed meatloaf"

Worse, because it fails in the opposite direction. 13 instruction steps:

- Steps 1–9 — the Kinder's-glaze version.
- Steps 10–13 — a different dish: *"Alternate mushroom sauce: Roast meatloaf (no glaze or sauce)"*,
  then sauté mushrooms, stock concentrate, sour cream, butter.

There is an ingredient section literally named `Alternate sauce (mushroom sauce)` **with zero
lines in it**. So the mushroom version's ingredients — mushrooms, stock concentrate, sour cream,
butter — exist only as prose inside step text. Cook the mushroom version and the shopping list
silently omits every ingredient you need for it.

Step 3 ("Prep potatoes per **Sliced potatoes** side") is a third thing again: a side leaking into
the main. That one is already handled correctly elsewhere — `recommendedSides` links
`sliced-potatoes` — so the step text is now redundant with the structured link.

---

## Recommendation: variants are separate recipes, joined by a link

The tempting model is a `variants: []` array inside a recipe. **Don't.** Every consumer would need
to learn about it — `shoppingMerge`, cook mode, the planner, the Kroger matcher, servings scaling,
the tag filter — and each would need a notion of "which variant is active", which is per-plan-slot
state that doesn't exist today. That's a schema change plus six subsystems, and the payoff is
saving a duplicated ingredient list.

Recipes are already cheap: `id`, tags, and a `forkedFromRecipeId` that **already exists on the
`Recipe` type** for exactly this shape of relationship. So:

1. **Each variant is a full, standalone recipe.** Correct shopping list, correct cook mode, can be
   planned on its own day, and shows up in tag filters under its own flavour tags.
2. **Link them** with the existing `forkedFromRecipeId` pointing at the original, and surface it on
   recipe detail as *"Other versions of this"* — a sibling lookup (`recipes.filter(r => r.forkedFromRecipeId === base || r.id === base)`),
   no schema change at all.
3. **Name them for the difference**, not "v2": *Air fryer chicken (Cajun)* / *Air fryer chicken
   (Italian)*. The difference is the whole reason both exist.

The only thing lost is editing the shared steps once. That's a real cost, and the honest answer is
it isn't worth six subsystems' complexity for a library this size — revisit if the library grows a
lot of variant families.

### Interaction with `recommendedSides`

The third backlog item asks to "build formal functionality" for recommended sides. It already
exists and works — `RecommendedSideRef` on the recipe, `recommendedSides` populated by
`scripts/recommendedSides.mjs`, rendered on recipe detail. What's missing isn't the mechanism, it's
that **steps still describe the side in prose** (meatloaf step 3). The cleanup is editorial:
delete side-prep steps from mains that already carry a `recommendedSides` link, and let the link do
the work.

---

## Concrete split plans

Neither is applied. Both invent no content except where flagged — and the flagged amounts are
genuinely unknown, because they were never in the data.

### Air fryer chicken → two recipes

**`chicken-air-fried`** — retitle *"Air fryer chicken (Cajun)"*, tags `main, chicken, air-fryer`.
Section `Rub` keeps only:

| ingredient | amount |
|---|---|
| cajun-rub | 1 tbsp |

**`chicken-air-fried-italian`** *(new)* — *"Air fryer chicken (Italian)"*, same tags plus
`italian`, `forkedFromRecipeId: "chicken-air-fried"`. Same `chicken-breast 8 oz` main line and the
same three steps. Section `Rub`:

| ingredient | amount |
|---|---|
| italian-seasoning | 1 tbsp |
| garlic-powder | 1 tsp |
| paprika | ½ tsp |
| salt-and-pepper | 1 tsp |

Ready to apply as-is — every amount already exists in the data.

### Meatloaf → two recipes

**`soy-glazed-meatloaf`** — keep steps 1–9, drop steps 10–13, drop the empty
`Alternate sauce (mushroom sauce)` section, and **delete step 3** (the potato prep, already covered
by the `sliced-potatoes` recommended side).

**`mushroom-gravy-meatloaf`** *(new)* — *"Meatloaf with mushroom gravy"*, tags `main, beef, baked`,
`forkedFromRecipeId: "soy-glazed-meatloaf"`. Same `Main` section as the original **minus**
`kinders-glaze`. Steps: the loaf steps from the original (mix, shape, roast 25 min at 450, rest)
with no glaze, then the current steps 11–13 as the gravy.

Its `Sauce` section needs these lines, which **do not exist anywhere in the data** and need your
amounts before this can be written:

| ingredient | amount | source |
|---|---|---|
| mushrooms | **?** | step says only "trim and thinly slice mushroom" |
| stock concentrate | **?** | step says "add stock concentrate and ¼ cup water" |
| sour cream | 1½ tbsp | stated in step 13 |
| butter | 1 tbsp | stated in step 13 |

Tell me the two missing amounts and I'll write the migration for both splits in one script,
matching `scripts/fix-red-pepper.mjs` (dry run by default, `--prod --apply` to ship).

---

## Related data problems found while reading this

- **`salt-and-pepper` is one ingredient.** It's used on 12 recipes. It can't be shopped (both are
  staples anyway), and it makes the Kroger matcher search the literal phrase "salt and pepper" —
  which at Ralphs returns *"Simple Truth® Salt and Pepper Pistachio Kernels"*. Splitting it into
  `salt` + `black-pepper` (both already exist, both already staples) would remove the row entirely
  from the order flow, which is the correct outcome.
- **`test-recipe` / "Test recipe2" is public** and visible to every user, including demo visitors.
- **Near-duplicate public recipes**: `chicken-parmesan` vs `chicken-parmesan-allrecipes-223042`,
  and `chili` ("Turkey Chili") vs `turkey-chili` ("Turkey Chili - crock pot"). The second pair is a
  legitimate variant family — a good first candidate for the sibling link above.
