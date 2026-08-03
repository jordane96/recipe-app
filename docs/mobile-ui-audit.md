# Mobile UI audit — August 2026

Backlog item: *"General mobile UI audit"* (P2).

Method: the running app driven at **375×812** and **320×568**, walking `/`, `/recipes`,
`/shopping`, `/history`, `/order/kroger` and cook mode. Every interactive element measured with
`getBoundingClientRect`, every font size with `getComputedStyle`. Numbers below are readings, not
impressions. Cook mode has its own report — see [cook-mode-audit.md](cook-mode-audit.md).

The bar used throughout is a **44×44px** touch target (iOS HIG / WCAG 2.5.5), and the question
asked of each control is not "is it small" but "is it small *and* used with one hand, in a store or
a kitchen, in a hurry".

---

## Healthy — checked and no action needed

- **No horizontal overflow on any route**, at 375px or 320px. `scrollWidth === clientWidth`
  everywhere. This is the failure mode that makes an app feel broken on a phone, and it's absent.
- **Shopping list item rows are 325×52 tap targets.** Each checkbox is wrapped in a
  `label.shopping-check-row`, so the whole row toggles — the single most-repeated interaction in
  the app is correctly built.
- Text sizes are sensible; the only sub-12px text found outside cook mode was one decorative caret
  glyph (`.recipe-filters-toggle-caret`, 11.5px, `aria-hidden`).

## Fixed in this pass

| Finding | Before | After |
|---|---|---|
| **"Mark all ingredients for this recipe" checkbox** on the shopping list was a bare `<input>` in a `<div>` — the only checkbox on the page *not* wrapped in a label, so it had no row to tap and you had to hit the 22px square itself. | 22×22 | 44×44 hit area via a wrapping label; checkbox visual unchanged |

Cook mode's six fixes (nav arrows, step dots, cancel, step label, note link) are listed in its own
report.

---

## Recommended, not done

Ordered by how often the control is actually used.

### 1. Meal chip controls on "My menu" — `/`

The home screen's per-meal controls are the smallest real targets in the app:

| control | size |
|---|---|
| `meal-chip-select-cook` (select for cooking) | **22×22** |
| `meal-chip-portion-btn` (− / + servings) | **30×26** |
| `meal-chip-assign` (view recipe) | 48×36 |
| `+ Add meal` | 319×**35** |

The −/+ pair is the worst case: two 30×26 targets sitting next to each other, so a sloppy tap
doesn't just miss, it decrements when you meant to increment. Recommend 44×44 for the stepper and
the select checkbox (the checkbox can use the same label-wrap fix applied to the shopping list),
and 44px height for `+ Add meal`.

### 2. Remove-from-list buttons — `/shopping`

`btn-remove` is **24×24** and sits next to the recipe link. Being a `<button>`, it can take the
cheap `::after` hit-area expansion used for the cook-mode dots — no layout change:

```css
.btn-remove { position: relative; }
.btn-remove::after { content:""; position:absolute; inset:-10px; }
```

Worth pairing with an undo toast, since it's destructive and about to get easier to hit.

### 3. Calendar month navigation — `/history`

`history-month-btn` (‹ ›) are **36×36**. Close, and they're isolated rather than paired, so this is
the lowest-priority of the three. 44×44 for consistency.

### 4. Recipe list filter toggle — `/recipes`

`recipe-filters-toggle` is **65×29**. It's the entry point to the whole faceted filter added in the
last few commits, so it's punching below its importance.

---

## One thing worth deciding, not just fixing

Four separate places now need the same "grow the hit area without moving the pixels" treatment, and
they've each been solved slightly differently (label wrap, `::after` overlay, explicit sizing). A
single utility — a `.tap-target` class plus a documented rule that *any* interactive element ships
at ≥44px — would stop this recurring. It's also the cheapest way to keep the next feature from
reintroducing 22px controls, which is how all of these got here.
