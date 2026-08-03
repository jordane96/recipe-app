# Cook mode design audit — August 2026

Backlog item: *"Cook mode — Design audit: review cook mode experience and recommend changes"* (P1),
plus *"Arrows cut off in cook mode on mobile"* (P2).

Measured in the running app at 320×568 and 375×812 against `lemon-italian-chicken-spaghetti`
(14 steps) and `chicken-piccata` (6 steps). Every number below is a real `getBoundingClientRect`
/ `getComputedStyle` reading, not an estimate.

The framing that drives all of it: **cook mode is the only screen used with dirty hands, from a
step or two back from the counter, under time pressure.** Controls that are merely acceptable
elsewhere in the app are not acceptable here.

---

## Fixed in this pass

| # | Finding | Before | After |
|---|---------|--------|-------|
| 1 | **Nav arrows clipped on iOS.** The footer override forced a 40px glyph in the `SFMono-Regular, Consolas, "Liberation Mono", monospace` stack into a 34px-tall button. iOS exposes no `SFMono-Regular` to web content, so it fell through to Courier, whose `←` ink is much taller than Chrome's and spilled past the button's cream background onto the teal footer — reading as "cut off". | 44×34 button, 40px monospace glyph | 44×44 button, 24px `var(--font-cook)` glyph, ~10px slack each side |
| 2 | **Nav arrows below the touch minimum.** Same rule capped the buttons at 34px tall. | 44×34 | 44×44 |
| 3 | **"Cancel cooking" unreadable and mis-tappable.** 10px white-on-teal — the *only* exit from cook mode — rendered as a 266×15px full-width strip 15px below the → arrow. | 266×15, 10px | 116×30, 13px, shrink-wrapped and centred |
| 4 | **"Step n of m" at 11px.** The only "where am I" cue on the screen. | 11px | 13px |
| 5 | **Step dots unusable by thumb.** 7×7px `role="tab"` buttons that jump steps. | 7×7px hit area | 13×32px hit area via `::after`, dot visual unchanged |
| 6 | **"Edit or add note" not a tap target.** | 88×14 | 95×28 |

All six are CSS-only (`src/index.css`); no component logic changed.

---

## Recommended, not done — needs a design decision

### A. The dot strip doesn't scale past ~10 steps

At 14 steps on a 320px viewport the dots wrap to two rows (measured strip height 23px vs 10px for
one row) and the whole strip is squeezed into a 150px middle column between the two arrows. Even
with the enlarged hit areas, 14 tiling 13px targets in 147px is a coin flip.

**Recommendation:** replace the dot strip with the "Step 4 of 14" label itself as a button that
opens a full-height step list (step number + first few words + a check for completed). That gives
random access with real row targets, scales to any recipe length, and frees the footer's middle
column. Keep dots only when `steps.length <= 8`.

### B. Step text is sized for a phone in your hand, not on the counter

Step body is 20px/30px. That's fine held at reading distance and marginal at arm's length on a
propped phone — which is how this screen is actually used.

**Recommendation:** either raise the step body to ~24px in cook mode, or add a persistent
text-size toggle (S/M/L) stored alongside the other cook-mode session state in
`cookModeSessionStorage.ts`. A toggle is the safer call — kitchen setups differ a lot.

### C. Recipe pills are 30px tall with 11px labels

When cooking two dishes at once the pills at the top are how you switch between them — 11px text
in a 30px pill, at the top of the screen, away from the thumb. Worth 36–40px and 13px text.

### D. There is no confirmation on "Cancel cooking"

It now takes a deliberate tap, but it still discards timer and step progress silently. Given
`cookProgressSession` already persists sessions, either confirm the discard or make it "Pause —
finish later" and let the Cooking-now tab hold it.

### E. Ingredients are behind a collapsed `▶ INGREDIENTS` disclosure

Right call for space, but it's a 13px header and the arrow is the only affordance. Consider showing
the ingredients *for the current step* inline (`stepIngredients` already exists on
`RecipeInstructionStep`) so the common case needs no disclosure at all.

---

## Checked and healthy

- Wake lock is held during cook mode (`useWakeLock.ts`) — the single most important thing for this
  screen, and it's there.
- Per-step timers with alerts (`timerAlert.ts`) work and the countdown is visible in the header.
- Swipe between steps is isolated from nested touch targets
  (`isolateNestedTouchFromSwipePaneProps`) — no accidental step changes when tapping a control.
- Multi-recipe cooking (the pills) is genuinely good and unusual for this class of app.
- No horizontal overflow at 320px; the card and footer stay inside the viewport.
