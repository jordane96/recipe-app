# Ingredient library audit — 2026-05

Scan of all 306 entries in the Neon `ingredients` table (mirrored at `public/ingredients.json` — the JSON file is now orphaned; the app reads from `/api/ingredients`). Findings grouped by severity.

## Already applied

- **Spinach** unit changed from `volume` → `weight` in the live Neon DB. Recipe "Sautéed spinach" calls it as `5 oz` and now parses cleanly.
- **Shopping list code fix** (`src/shoppingMerge.ts`): raw / unit-mismatched lines now inherit the ingredient's catalog category instead of falling into "Other". Future data/unit drift won't visibly break grouping.

## Open recommendations

### A. Real bugs (worth fixing soon)

#### Unit type mismatches — same physical thing tagged inconsistently across siblings

| Item | Current | Suggested | Why |
|---|---|---|---|
| Mixed greens | `volume` | `weight` | Sold as ~5oz container. (Not used in any recipe yet — forward-looking.) |
| Peas | `volume` | `weight` | Frozen peas sold in 12–16oz bags. (Not used in any recipe yet.) |
| Edamame | `volume` | `weight` | Sold by weight (frozen bag). (Not used in any recipe yet.) |

The code fix already handles the symptom (these would group correctly even with the mismatch), but the data is still wrong on principle.

#### Duplicate concepts — should consolidate

- `butter` and `butter-unsalted` — two IDs for one ingredient with a property. Recipes using either won't merge in the shopping list. **Decision deferred** — `butter-unsalted` stayed in the catalog (zero recipe usages today, but Jordan opted to leave room for future "unsalted preferred" semantics).
- `sirloin-steak` (Top sirloin steak) and `sirloin-steak-two` (Sirloin steaks (5 oz each)) — duplicate. The "5 oz each" variant has zero recipe usages.
- `bavette-steak` (Bavette (sirloin flap) steak) and `steak-bavette-raw` (Bavette steak (5 oz each)) — duplicate. The "5 oz each" variant has zero recipe usages.
- `cheese` (generic, dairy/volume) and the specific cheeses (cheddar, mozzarella, etc.) — the generic is a fallback footgun; should be removed or hidden in the picker.
- **Four water entries**: `water`, `hot water`, `warm water`, `water (for rice)`. Temperature/use isn't an ingredient distinction. Consolidate to one.

#### Brand-locked items (block matching when a recipe says the generic)

These should become generic with the brand as an optional attribute / note:

- `Pace hot salsa (large)` → "Salsa (jarred)"
- `Cooking spray (Pam)` → "Cooking spray"
- `Safeway tomato soup` → "Tomato soup (canned)"
- `McCormick meatloaf seasoning`
- `Frank's seasoning blend`
- `Stubb's rub`
- `Kinder's glaze`
- `Grill Mates spices`

#### Wrong category / type / shape

- `Lemon panko burrata salad` (category: other, unit: count) — a finished dish, not an ingredient. Remove.
- `Couscous / pasta` — single ID with "or"-naming. Split into separate `couscous` and `pasta`.
- `Quesadilla (optional)` — quesadilla isn't an ingredient. Authoring artifact.
- `Red pepper (spice or veg)` — one ID for two distinct things. Split into `red-pepper-flakes` (spices) and reuse `bell-pepper` (produce).
- `Frank's seasoning blend` has `unit: weight` while all other dry spices are `volume`. Likely should be `volume`.
- `Pita bread` uses `unit: piece` (unique in the catalog) while other countable breads use `count`. Standardize to `count`.

### B. Missing common ingredients

Show up (or would show up) in recipes but aren't in the catalog → users get forced into "custom" tags:

- **Lime juice** — only `Lemon juice` exists.
- **Salsa (generic jarred)** — only `Salsa verde` and brand-specific `Pace hot salsa`.
- **Tomato soup (generic canned)**.
- **Ground chicken** — only ground turkey/beef/lamb/pork are listed.

### C. Fresh-herb unit consistency

Currently split between `volume` and `count` with no rule:

| Herb | Unit |
|---|---|
| Dill (fresh) | volume |
| Mint (fresh) | count |
| Parsley | count |
| Rosemary (fresh) | count |
| Sage (fresh) | count |
| Thyme (fresh) | count |
| Cilantro | count |

Recommend: standardize to `volume` (tbsp) since fresh herbs are usually measured chopped, not by sprig. Alternative: commit to `count` and update recipes.

### D. "Spinach not tagged as a vegetable" — separate concern

There's no per-ingredient "vegetable" tag in the schema, only the broader `produce` category. The doc concern was likely about the **recipe-level** `vegetables` tag, which *is* correctly present on the "Sautéed spinach" recipe. If the bug surfaces as "spinach not filterable as a vegetable", the issue lives in how recipe filters use the tag — not in ingredient data. Investigate separately.

### E. Categories that look clean

`baking`, `dairy` (apart from the cheese-duplication note), `proteins` (apart from the duplicate steak items) — internally consistent.

## How to apply

All of the above are data changes on the Neon `ingredients` table. Two options:

1. **SQL via Neon MCP** — exact statements per item, approved one at a time (what we did for spinach).
2. **Bulk migration script** in `scripts/` — single PR with a node script that issues all UPDATE/DELETE statements idempotently, easier to review and roll back.

Section A's mechanical fixes are a good candidate for option 2. Brand-locking / consolidation items in A and the missing items in B are per-decision; better as individual SQL.
