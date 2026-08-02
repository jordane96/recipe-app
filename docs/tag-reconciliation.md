# Recipe Tag Reconciliation Plan (v2)

**Date:** 28 July 2026 · Companion to `ui-audit-findings.md` (findings F-031, F-032)
**Scope:** all 66 recipes owned by `JordanE`. Analysed on the isolated `ui-audit` Neon branch; **nothing has been changed** — this is a proposal.

> **v2 changes** after review: `baked` kept as a cooking method (and `stovetop` with it, so the facet
> doesn't lie by omission); a **Protein** facet added, absorbing `vegetables` as `veggie`; the
> **Dish type** facet dropped entirely, which removes `soup` and shelves the proposed `appetizer`;
> **Diet / workflow** renamed **Additional tags**.

---

## Current state

21 distinct tags, 1.76 per recipe. `main` (47) and `side` (17) cover almost everything, then it collapses — **9 tags are used on exactly one recipe.**

1. **Four duplicate pairs** render as separate chips: `crock pot` (13) / `crock-pot` (2) · `mexican` (2) / `Mexican` (1) · `italian` (5) / `Italian-American` (1) · `Greek` as the lone capitalised cuisine.
2. **Under-tagging is the bigger problem.** 34 of 66 carry only a course tag, and some are wrong by omission — "Air Fryer Mozzarella Sticks" and "Chicken (air fried)" have no `air-fryer` tag, so filtering by it hides 2 of the 8.
3. **Six unrelated facets share one flat namespace**, so `keto` sits beside `main` beside `chicken` in a single undifferentiated chip row.

---

## Vocabulary — 24 tags across 4 facets

### Course — required, exactly one
`main` · `side`

**Structural, not descriptive.** [`recipeSegment()`](../src/recipeCourse.ts) returns `main | side | other`
and every consumer collapses it to a binary (`kind === "side" ? "side" : "main"`) — planner card
colours, sort order, cook history, shopping-list grouping. Adding values here means extending the
type and seven call sites, which is why `soup` and `appetizer` are **not** course values.

### Protein — optional, at most one
`chicken` (24) · `beef` (15) · `veggie` (21) · `turkey` (2) · `pork` (2) · `seafood` (1)

Answers "what am I in the mood for". `veggie` means no meat, and replaces the old `vegetables` tag.

### Method — optional, at most one
`crock-pot` · `air-fryer` · `grill` · `baked` · `stovetop`

Kept `baked`, and `stovetop` alongside it — with `baked` present, an untagged stovetop recipe would
silently vanish from a method filter.

**Every method below is derived from the recipe's own instruction text, not guessed from its title.**
15 recipes name two methods (a crock pot plus a browning step, an air fryer plus boiling pasta), so
the rule is: **tag the distinguishing appliance** — the one that changes how you plan your day.
crock-pot > grill > air-fryer > baked > stovetop, with stovetop only when nothing else applies.
Three recipes involve no cooking at all and correctly have no method.

### Cuisine — optional, at most one
`italian` · `mexican` · `asian` · `indian` · `japanese` · `greek` · `southern` · `middle-eastern` · `lithuanian`

The most natural browse axis and the most under-used today — 12 recipes have one; 36 would.

### Additional tags — optional, any number
`keto` · `meal-prep`

The catch-all for anything that isn't course, protein, method or cuisine. `freezer` folds into
`meal-prep` (both sat on the same single recipe).

### Dropped
| Tag | Why |
|---|---|
| `chicken` (as a bare tag) | Superseded by the Protein facet |
| `vegetables` | Superseded by `veggie` |
| `soup` | Dish-type facet removed; both soup titles contain "Soup", so search already finds them |
| `freezer` | Merged into `meal-prep` |
| `crock-pot`, `Mexican`, `Italian-American`, `Greek` | Merged into canonical spellings |

**Naming rule:** lowercase, hyphen-separated, singular. `crock pot` → `crock-pot`, matching the
existing `air-fryer` and `meal-prep`.

**On the count:** 21 → 24, which is *more* tags, not fewer. That is deliberate. The original
complaint was never the number; it was 21 undifferentiated chips mixing six concepts, a third of
them used once. Grouped into four labelled facets where each value earns its place, 24 reads as far
less than 21 did. If it still feels heavy once grouped, the cheapest trims are the four
single-recipe cuisines and `stovetop`.

---

## Per-recipe values

All values are derived from the recipe's own ingredients and instruction text. The ten open questions from v2 are now resolved — see *How the last ten were settled* below.

| Recipe | Course | Protein | Method | Cuisine | Additional |
|---|---|---|---|---|---|
| Air fryer asparagus | side | veggie | air-fryer | — | — |
| Air fryer broccoli | side | veggie | air-fryer | — | — |
| Air fryer Brussels sprouts | side | veggie | air-fryer | — | — |
| Air fryer potatoes | side | veggie | air-fryer | — | — |
| Air fryer squash | side | veggie | air-fryer | — | — |
| Air fryer zucchini chips | side | veggie | air-fryer | — | — |
| Air Fryer Mozzarella Sticks | side | veggie | air-fryer | — | — |
| Barbacoa | main | beef | crock-pot | mexican | — |
| Beef Stew | main | beef | crock-pot | — | — |
| Beef tortilla melts | main | beef | stovetop | mexican | — |
| Butter Chicken | main | chicken | crock-pot | indian | — |
| Cayenne breaded chicken | main | chicken | baked | — | — |
| Chicken (air fried) | main | chicken | air-fryer | — | — |
| Chicken and Dumplings | main | chicken | crock-pot | southern | — |
| Chicken katsu curry | main | chicken | air-fryer | japanese | — |
| Chicken Marsala | main | chicken | stovetop | italian | — |
| Chicken Parmesan | main | chicken | baked | italian | — |
| Chicken Parmesan (AllRecipes #223042) | main | chicken | baked | italian | — |
| Chicken Piccata | main | chicken | stovetop | italian | — |
| Chicken pita pockets | main | chicken | stovetop | greek | — |
| Chicken Tikka Masala | main | chicken | crock-pot | indian | — |
| Chicken Tortilla Soup | main | chicken | crock-pot | mexican | — |
| Crock Pot Chicken & Broccoli-Rice Freezer Burritos | main | chicken | crock-pot | mexican | meal-prep |
| Curry peanut chicken | main | chicken | stovetop | asian | — |
| Dijon onion chicken | main | chicken | baked | — | — |
| Fried rice | side | veggie | stovetop | asian | — |
| Garlic bread | side | veggie | baked | italian | — |
| Green Chicken Pozole (Pozole Verde) | main | chicken | crock-pot | mexican | — |
| Grilled burger | main | beef | grill | — | — |
| Grilled carne asada | main | beef | grill | mexican | — |
| Grilled chicken | main | chicken | grill | — | — |
| Grilled hot link | main | pork | grill | — | — |
| Grilled tri tip | main | beef | grill | — | — |
| Grilled wings | main | chicken | grill | — | — |
| Hummus | side | veggie | — | middle-eastern | — |
| Lasagna (baked) | main | beef | baked | italian | — |
| Lasagna (slow cooker) | main | beef | crock-pot | italian | — |
| Lemon Garlic Chicken | main | chicken | crock-pot | — | — |
| Lemon italian chicken w/ spaghetti | main | chicken | air-fryer | italian | — |
| Lemon panko burrata salad | side | veggie | stovetop | italian | — |
| Lemon spaghetti | side | veggie | stovetop | italian | — |
| Mashed potatoes | side | veggie | stovetop | — | — |
| Meatballs (Keto) | main | beef | air-fryer | italian | keto |
| Meatballs (slow cooker) | main | beef | crock-pot | italian | — |
| Miso Salmon | main | seafood | stovetop | japanese | — |
| Mozzarella crusted chicken | main | chicken | baked | italian | — |
| Pepper Steak | main | beef | crock-pot | — | — |
| Pot roast (Keto, crock pot) | main | beef | crock-pot | — | keto |
| Quesadilla (with leftovers) | main | — | stovetop | mexican | — |
| Regular rice | side | veggie | stovetop | — | — |
| Sausage pasta | main | pork | air-fryer | italian | — |
| Sautéed spinach | side | veggie | stovetop | — | — |
| Sliced potatoes | side | veggie | baked | — | — |
| Soy glazed meatloaf | main | beef | baked | — | — |
| Steak and jam/honey mustard sauce | main | beef | stovetop | — | — |
| Steak and spicy soy sauce | main | beef | stovetop | asian | — |
| Sweet potato fries | side | veggie | air-fryer | — | — |
| Taco chicken (crock pot) | main | chicken | crock-pot | mexican | — |
| Tortellini | main | veggie | stovetop | italian | — |
| Tortellini, Spinach & Chicken Soup | main | chicken | crock-pot | italian | — |
| Turkey Chili | main | turkey | stovetop | — | — |
| Turkey Chili - crock pot | main | turkey | crock-pot | — | — |
| Tuscan Chicken | main | chicken | crock-pot | italian | — |
| Tzatziki | side | veggie | — | greek | — |
| Šaltibarščiai | main | veggie | stovetop | lithuanian | — |
| ~~Test recipe2~~ | — | — | — | — | **delete, don't tag** |

### How the last ten were settled

Reading the full instruction text rather than pattern-matching resolved every open question:

| Recipe | Was | Now | Evidence |
|---|---|---|---|
| Chicken pita pockets | no method | `stovetop`, `greek` | *"Pan fry chicken for 4-6 minutes"* — it does cook; "pan fry" was missed by the earlier regex. Pita, hummus and Greek vinaigrette settle the cuisine. |
| Soy glazed meatloaf | `stovetop`, `asian` | `baked`, no cuisine | *"Cook for 25 min at 450"*, *"Roast meatloaf"*. The glaze is soy-based but the dish is an American meatloaf — a soy glaze doesn't make it Asian. |
| Lemon spaghetti | `air-fryer` | `stovetop`, `veggie` | The air fryer only does the zucchini garnish — *"combine with any main going into air fryer"*. The dish is boiled pasta with a sautéed sauce. Its "chicken" was stock concentrate. |
| Garlic bread | unresolved | `baked` | Only *"cook for 5 min"*, no appliance named — but bread with butter and parmesan for 5 minutes is an oven. Lowest-confidence call here. |
| Grilled carne asada | `beef ⚠` | `beef` | Ingredient is named "Carne asada", so nothing matched "beef". |
| Quesadilla (with leftovers) | `veggie ⚠` | *no protein* | Ingredient is literally "Leftover meat / filling". Empty is the honest answer. |
| Curry peanut chicken | `asian ⚠` | `asian` | Yellow curry paste and peanut butter (Thai) with mirin (Japanese) — a fusion, so the general bucket is right. |
| Meatballs (Keto) | `italian ⚠` | `italian` | Tomato sauce, parmesan, mozzarella, oregano. |

**Lemon italian chicken w/ spaghetti stays `air-fryer`** — unlike Lemon spaghetti, its chicken really is
air-fried (*"Air fry chicken for 13 min"*).

One data issue surfaced along the way: **Lemon spaghetti and Lemon italian chicken share near-identical
instruction text**, which looks like a copy-paste artifact rather than a tagging problem.

---

## Resulting distribution

| Facet | Values | Coverage |
|---|---|---|
| Course | main (47), side (18) | 65/65 |
| Protein | chicken (24), veggie (21), beef (15), turkey (2), pork (2), seafood (1) | 65 |
| Method | crock-pot (17), stovetop (18), air-fryer (13), baked (9), grill (6) | 63 — 2 no-cook |
| Cuisine | italian (16), mexican (8), asian (4), indian (2), japanese (2), greek (2), southern (1), middle-eastern (1), lithuanian (1) | 37 — up from 12 |
| Additional | keto (2), meal-prep (1) | 3 |

---

## Sequencing — order matters

Cleaning the data first would be undone by the next import, because
[`api/recipes/parse.js`](../api/recipes/parse.js) types tags as an unconstrained `z.array(z.string())`.

1. **Constrain the parser** to this vocabulary (a `z.enum` per facet) so imports can't mint `Italian-American` again.
2. **Add a normaliser** on write *and* read — lowercase, trim, hyphenate — so stray input collapses onto a canonical tag.
3. **Group chips by facet in the UI.** [`uniqueTags()`](../src/RecipeList.tsx) emits one flat row today; labelled groups are what actually fixes "too many tags".
4. **Add tag editing** (F-031) — there is currently no way to add, rename, remove or merge a tag anywhere in the app, which is why these duplicates can't be fixed by hand.
5. **Then migrate the data** from the table above.

Steps 1–4 are code and safe to do now. Step 5 is an `UPDATE` against **production** — the `ui-audit`
branch is a throwaway copy, so the migration has to target the live database. Same shape as the
servings backfill: verify on the branch, snapshot `main` as a rollback point, then apply.
