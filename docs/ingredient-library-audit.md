# Ingredient library audit

Working notes for `scripts/ingredientLibrary.mjs` and structured rows in `scripts/recipeIngredientSections.mjs`.

---

## 1. Qualitative lines (no amount / no unit) — **review required**

### Why it matters

The shopping list merge (`src/shoppingMerge.ts`, `lineToBucket`) only sums **volume / weight / count** when **both** `amount` and `unit` are set. Any line with `amount: null` or `unit: null` becomes a **`raw`** row: it is **not** merged with numeric lines for the same `ingredientId`.

**Example:** `chicken-breast` at `10 oz` merges with other oz lines; `chicken-breast` with no amount (e.g. katsu “butterflied & pounded”) appears as a **separate** combined-list row.

### Browser overrides (optional)

Overrides can still live in the browser (`localStorage` key `recipe-app-qualitative-overrides-v1`) if you set them manually or from an older build; they apply to recipe views and the combined shopping list until cleared. For durable fixes, edit source sections and run `npm run data:apply-qualitative` / `npm run data:publish` as needed.

### Audit action (source files)

For **each** qualitative row below, decide:

- **Keep qualitative** — intentional (e.g. reference-only, “to taste”, optional side).
- **Add amount + unit** — move prep or context into `note` so the line merges (e.g. katsu chicken → `10 oz`, note “butterflied & pounded”).

After edits, run `npm run data:publish` and sync `recipes/recipes.json` if you use the monorepo copy.

### Regenerate this inventory

From repo root:

```bash
node --input-type=module -e "import { SECTIONS } from './recipe-app/scripts/recipeIngredientSections.mjs'; const rows=[]; for (const [rid, secs] of Object.entries(SECTIONS)) { for (const s of secs) { for (const L of s.lines) { if (L.amount==null||L.unit==null) rows.push({recipe:rid, section:s.name, id:L.ingredientId, note:L.note||''}); } } } rows.sort((a,b)=>a.id.localeCompare(b.id)||a.recipe.localeCompare(b.recipe)); console.log(JSON.stringify(rows,null,2));"
```

### Current qualitative rows (snapshot)

`ingredientId` appears multiple times when several recipes use that id without amounts (merge gaps).

| Recipe | Section | ingredientId | note |
|--------|---------|----------------|------|
| veggie-air-fry-grill-times | General | air-fry-veggie-note | olive oil, salt, pepper; toss halfway |
| grilled-burger | Main | all-purpose-seasoning | |
| veggie-air-fry-grill-times | General | asparagus | 400°F 6–8 min |
| taco-chicken-crock-pot | Main | avocado | optional |
| pot-roast-keto | Main | beef-broth | ½ cup per lb roast |
| taco-chicken-crock-pot | Main | blue-corn-tortilla-chips | optional |
| garlic-bread | Main | bread-roll | |
| veggie-air-fry-grill-times | General | broccoli | 400°F 6 min |
| veggie-air-fry-grill-times | General | brussels-sprouts | 375°F 10 min |
| grilled-burger | Main | burger-patty | |
| grilled-carne-asada | Main | carne-asada | |
| curry-peanut-chicken | Sides | carrots | cucumber, scallions, ACV 1 tbsp — optional |
| fried-rice | Main | carrots | |
| mozzarella-crusted-chicken | Sides | carrots | |
| quesadilla-leftovers | Main | cheese-generic | |
| sausage-pasta | Topping | cheese-mexican-blend | |
| chicken-air-fried | Main | **chicken-breast** | with olive oil & cajun rub (or other spice mix) |
| chicken-katsu-curry | Main | **chicken-breast** | butterflied & pounded |
| grilled-chicken | Main | **chicken-breast** | grilled |
| taco-chicken-crock-pot | Main | **chicken-breast** | 4–7 lb |
| quesadilla-leftovers | Sauce / toppings | cholula | hot sauce, red pepper, cayenne |
| pot-roast-keto | Main | chuck-roast | 2–4 lb |
| mozzarella-crusted-chicken | Sides | couscous-or-pasta | |
| chicken-pita-pockets | Main | cucumber-mini | |
| chicken-katsu-curry | Sauce | curry-cubes | |
| chicken-pita-pockets | Main | dressing-greek-vinaigrette | splash |
| grilled-wings | Main | franks-hot-sauce | ~0.5 bottle per lb wings |
| dijon-onion-chicken | Main | fried-onion-crisps | 1½ handfuls |
| miso-salmon | Sides | fried-rice-optional | |
| chili | Side | garlic-bread | |
| dijon-onion-chicken | Sides | garlic-bread | |
| garlic-bread | Main | garlic-butter | |
| dijon-onion-chicken | Sides | green-beans | |
| grilled-chicken | Main | grill-mates-spice | |
| grilled-hot-link | Main | hot-link | |
| chicken-pita-pockets | Main | hummus | |
| soy-glazed-meatloaf | Sauce | kinders-glaze | ¼ cup before + ¼ cup after OR |
| quesadilla-leftovers | Main | leftovers-meat | |
| steak-jam-honey-mustard-sauce | Sauce | lemon-juice | 1 squeeze |
| meatballs-keto | Topping | mozzarella-topping | |
| pot-roast-keto | Main | mushrooms | |
| lemon-panko-burrata-salad | Ingredients | olive-oil | drizzle |
| mozzarella-crusted-chicken | Main | olive-oil | with salt & pepper |
| pot-roast-keto | Main | onion | |
| chicken-katsu-curry | Main | pam-spray | |
| garlic-bread | Main | parmesan-cheese | to top |
| pot-roast-keto | Main | parsley | optional |
| veggie-air-fry-grill-times | General | potato | 400°F 18–20 min |
| tortellini-tomato-soup | Main | prepackaged-tortellini | |
| taco-chicken-crock-pot | Main | quesadilla-shell | |
| sausage-pasta | Topping | red-pepper | |
| chicken-katsu-curry | Sides | rice-dry | |
| taco-chicken-crock-pot | Main | rice-optional-side | |
| tortellini-tomato-soup | Sauce | saffeway-tomato-soup | |
| steak-jam-honey-mustard-sauce | Side | salad-lemon-panko-burrata | |
| chicken-air-fried | Optional spice mix | salt-and-pepper | |
| pot-roast-keto | Main | salt-and-pepper | |
| veggie-air-fry-grill-times | General | spinach | sauté |
| veggie-air-fry-grill-times | General | squash | 400°F 8 min |
| grilled-tri-tip | Main | stubbs-rub | |
| meatballs-keto | Topping | tomato-sauce | |
| sausage-pasta | Topping | tomato-sauce | |
| grilled-tri-tip | Main | tri-tip | |
| grilled-wings | Main | wings | |
| veggie-air-fry-grill-times | General | zucchini-chips-note | |

---

## 2. Other audit topics (from library review)

Track separately (decisions TBD in conversation):

- **Duplicate / similar ids** — e.g. `flour-tortilla` vs `tortilla-flour-small`, `scallions` vs `scallion`, breadcrumbs / panko cluster.
- **Unused library rows** — ids in `INGREDIENTS` not referenced in `SECTIONS` (safe cleanup candidates after confirmation).
- **Typos** — e.g. `saffeway-tomato-soup` id vs brand spelling.
- **Chicken cuts** — keep `chicken-breast` vs `wings` separate vs single `chicken` id (affects merge behavior).

---

## 3. Open questions (one-at-a-time)

Prior discussion items to resolve before bulk merges: chicken merge strategy, scallion standardization, tortilla ids, water/breadcrumb/rice clustering, dead ids removal, composite rows like `salad-lemon-panko-burrata`.
