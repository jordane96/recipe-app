# Recipe App — Full UI Audit Plan

Audit the app as a real user would: click through every workflow, judge usability and visual quality, stress layouts with breakpoints and pathological content, and check design best practices. Produce a ranked findings report with screenshots.

**Executor notes (read first):**
- Two processes required: `node scripts/local-api.mjs` (port 3001, background task) **and** the Vite preview (`.claude/launch.json`, port 5173). If only Vite runs, every page fails with a JSON parse error — that's a setup problem, not a finding.
- Auto-login with dev credentials from `.claude/dev-credentials.md` per `CLAUDE.local.md` (`JordanTest2` / see file).
- The app is a React SPA on **HashRouter** (`/#/route`). Scroll restoration is hand-rolled in `src/App.tsx` — treat back/forward scroll position as a first-class test target.
- All CSS is in `src/index.css` (~6,900 lines) + `src/kroger.css`. There is **no dark mode** — do not test it; instead note it in recommendations if relevant.
- Kroger/Safeway flows hit real external services. **Audit only up to the external boundary** (OAuth redirect, safeway.com handoff). Never enter real credentials or complete checkout.
- Number every finding (F-001…), capture a screenshot for each, note route + viewport width + repro steps.

## Safety guardrails (hard rules — read before touching anything)

**Database: local dev points at an isolated Neon branch, not production.** `.env.local`'s `DATABASE_URL` targets the `ui-audit` branch (`br-odd-haze-amyo1fn0`, project `sweet-surf-68389183`) — a disposable full copy of production data (71 recipes, all accounts) that auto-expires 2026-08-11. Production (`main` branch, `ep-dawn-dust-…` endpoint) is untouched by anything the app does locally.

1. **Verify isolation before mutating anything.** At startup, confirm `.env.local`'s `DATABASE_URL` host is `ep-polished-feather-am06mifz-pooler…` (the branch). If it's `ep-dawn-dust-…`, STOP — that's production (e.g. a `vercel env pull` overwrote the override) — and fall back to read-only auditing until it's re-pointed.
2. **Data mutations are then fair game** — create, edit, delete, clear-all: all fine, it's a disposable copy. Still prefix audit-created items with `[AUDIT]` so findings screenshots are self-explanatory. No DB cleanup pass is needed; the branch expires on its own.
3. **Zero source-code changes.** No edits to `src/`, `api/`, `scripts/`, CSS, or config (including `.env.local`); no git commits, branches, or pushes; no npm installs. The only files the audit may write are its own deliverables in `docs/` and scratch files.
4. **No external side effects.** Stop at the Kroger OAuth redirect; do not link accounts, add to real carts, or interact with retailer sites. Draft the email — never send it.
5. **Don't touch the Neon MCP mutation tools** (delete_branch, reset, run_sql writes, migrations). The branch is set up; the audit only consumes it through the app.

---

## Phase 0 — Setup & seed data

1. Start `local-api.mjs` (background), start Vite preview, sign in.
2. Confirm DB isolation per guardrail 1, then take the **Phase-0 snapshot** (screenshots) of the recipe list, planner, shopping list, and history — the desktop baseline for later comparisons.
3. Confirm baseline data exists; if thin, create it (all names prefixed `[AUDIT]`) so later phases have material:
   - ≥6 recipes spanning: short title, very long title (60+ chars), 1-ingredient recipe, 30-ingredient recipe, recipe with long instruction steps, recipe with no image (if images exist).
   - A meal plan with several days populated.
   - A shopping list with ~15 items including ones with notes.
3. Record the "known-good" desktop screenshot of each route as a baseline.

## Phase 1 — Workflow walkthroughs (test cases)

### W1. Entry & first-run
- **TC-1.1** Sign-in screen: label/placeholder quality, Enter key submits, wrong-password error is visible and polite (not a raw API message), password field masks input, no layout shift when error appears.
- **TC-1.2** Loading state between auth and app: is there a flash of empty content or spinner jank?
- **TC-1.3** Onboarding overlay: open from nav, step through fully, close mid-way, reopen — does it resume or restart sensibly? Escape key and backdrop-click behavior. Focus trapped inside while open?
- **TC-1.4** Sign out → back button. Does any authed content flash? Sign back in — does prior state (planner, list) persist as expected?

### W2. Meal planner (home)
- **TC-2.1** Empty planner: is there a useful empty state with a call to action, or a blank grid?
- **TC-2.2** Add a recipe to a day; verify feedback (toast? in-place render?) and that nav counts update.
- **TC-2.3** Drag interactions (planner has drag code): drag a meal between days — works with mouse; what happens on touch viewport? Is there a non-drag fallback (move/reschedule button)?
- **TC-2.4** Remove a planned meal — confirmation vs. instant, and is it undoable?
- **TC-2.5** Week navigation (prev/next/today): current day clearly marked, dates correct across a month boundary.
- **TC-2.6** Fully packed week (every day filled): row heights, wrapping, scroll behavior.
- **TC-2.7** Servings adjustment from the planner (servings code present): does changing servings propagate to the shopping list quantities?

### W3. Recipes — browse & detail
- **TC-3.1** Recipe list: scan-ability, search/filter behavior (type fast, clear, no results state), sort order is comprehensible.
- **TC-3.2** List → detail → back: scroll position restored to where you were in the list (hand-rolled logic — probe it with a long list).
- **TC-3.3** Recipe detail: ingredient list readability, instruction step formatting, servings scaling math (fractions like ½, unit changes), long titles/notes wrap not overflow.
- **TC-3.4** Deep-link refresh: hard-reload on `/#/recipe/:id` — loads correctly, no 404/redirect-to-home.
- **TC-3.5** Nonexistent recipe id in URL: graceful handling vs. crash/blank.

### W4. Add / edit / discover recipes
- **TC-4.1** Add recipe form: every field has a visible label (not placeholder-only), tab order is logical, required fields marked, URL import field (`type="url"`) validates bad input with a helpful message.
- **TC-4.2** Import-from-URL: paste a real recipe URL — loading feedback during fetch, failure message on a junk URL, no double-submit if clicked twice.
- **TC-4.3** Ingredient entry comboboxes (3 variants exist: `IngredientSearchCombobox`, `AddIngredientLibraryCombobox`, `StringSearchCombobox`): keyboard-only operation (arrows, Enter, Escape), option list doesn't overflow viewport, behavior consistent across all three.
- **TC-4.4** Abandon with unsaved changes (navigate away, back button): silent data loss vs. warning.
- **TC-4.5** Edit recipe: fields pre-populated correctly, save reflects immediately on detail page, cancel discards.
- **TC-4.6** Delete a recipe that is on the meal plan and shopping list — what happens downstream? Any orphaned references? (Prefer an `[AUDIT]` recipe so screenshots are self-explanatory.)
- **TC-4.7** Discover page: browsing flow, adding a discovered recipe, duplicate-add handling.

### W5. Cook flow
- **TC-5.1** Start cook mode from detail: panel legibility at arm's length (font size — this is used *while cooking*), step progression, can you check off steps?
- **TC-5.2** Leave cook mode mid-recipe, navigate elsewhere, return — progress preserved (session storage code exists: `cookProgressSession.ts`)?
- **TC-5.3** Cooking Now page with 0, 1, and 3 active cooks; nav badge count correctness (2-digit count fits?).
- **TC-5.4** Complete a cook → appears in History with correct date; History page grouping/sorting sensible.

### W6. Shopping & ordering
- **TC-6.1** Generate list from plan: quantities aggregate across recipes (2 recipes both using onions → merged line?), notes display.
- **TC-6.2** Check off items: tap target size, visual state, checked items' position (move to bottom? stay?), persistence across reload.
- **TC-6.3** Add a manual `[AUDIT]` item; edit and remove it. Run clear-all for real (branch DB, safe): is there a confirmation or undo? If it wipes silently, that's a P1 finding.
- **TC-6.4** Place order → retailer chooser: options clear to a first-timer, Instacart placeholder page doesn't look broken.
- **TC-6.5** Kroger page, not-linked state: is the OAuth explanation clear? Store picker flow; ingredient→product match UI (wrong match correctable?); "checkout happens on Kroger.com" framing present (required per project notes). Stop at the OAuth redirect.
- **TC-6.6** Safeway both variants (extension vs. screenshot flow): does the device-dependent split explain itself? Screenshot list shows quantities + notes.
- **TC-6.7** Kill `local-api.mjs` mid-session and interact: are API errors surfaced as readable messages or silent failures/raw JSON? (Restart it after.)

### W7. Navigation & chrome
- **TC-7.1** Nav drawer: open/close animation, focus moves into drawer, Escape closes, `aria-expanded`/`aria-controls` actually toggle, background scroll locked while open.
- **TC-7.2** Current-page highlighting correct on every route, including nested ones (`/order/kroger` — is anything highlighted?).
- **TC-7.3** Browser back/forward through a 6-page trail: each POP restores scroll; each PUSH snaps to top (per the App.tsx logic).
- **TC-7.4** Unknown route → redirects home silently; is that the right UX or should it message?
- **TC-7.5** Page titles (`document.title`) update per route? Browser tab useful?

## Phase 2 — Breakpoint & viewport audit

The CSS uses **380, 520, 540, and 720px** breakpoints (inconsistently — both max- and min-width). Test every primary route at:

| Width | Why |
|---|---|
| 375 | iPhone SE/mini class; below the 380 special-case |
| 381 | just above the 380 rule — catch off-by-one styling |
| 520 / 525 / 540 | straddle the 520 max-width and 540 min-width rules — there is a **519–539px dead zone** where neither "mobile" nor "≥540" rules may apply; look for broken layouts in that band |
| 719 / 721 | straddle the 720 rule |
| 768, 1280 | tablet, desktop baseline |
| 1920 | does content max-width cap, or do lines stretch unreadably? |

Per width, per route check: horizontal scrollbar (automatic fail), text truncation vs. overlap, touch targets ≥ ~44px at mobile widths, drawer vs. persistent nav behavior, form fields fitting, table/grid collapse, modals and combobox dropdowns fitting the viewport, images not distorted.

Also: **`prefers-reduced-motion`** is implemented in 3 places in index.css — toggle it (DevTools emulation via javascript_tool or resize prefs) and confirm animations actually stop, and that nothing *depends* on an animation finishing.

## Phase 3 — Content stress tests

- **CS-1** Recipe titled with 80 chars, no spaces (`Superlongunbroken…`) — card, detail header, planner cell, shopping list source label.
- **CS-2** Ingredient with a 120-char note — shopping list line, Kroger match row, Safeway screenshot list.
- **CS-3** Recipe with 30 ingredients + 15 steps — detail page, cook mode, add-to-list.
- **CS-4** Empty states, every page: 0 recipes, empty plan, empty list, empty history, 0 cooking now. Each should explain itself and offer the next action — blank white space is a finding.
- **CS-5** Nav badge counts at 0 (hidden or "0"?), 9, 42.
- **CS-6** Numeric edge cases: servings 1 and 99, quantity 0.25, quantity 1000. Fraction rendering (¼ vs 0.25) consistent app-wide?
- **CS-7** Unicode/emoji in a recipe title and ingredient name — renders everywhere including the Safeway screenshot flow?
- **CS-8** Slow network (throttle via DevTools protocol if available, else kill/restart API): loading states exist and don't layout-shift on resolve.

## Phase 4 — Design best-practices review

Judge each area against this checklist; deviations become findings.

**Visual hierarchy & layout**
- One clear primary action per screen; primary/secondary/tertiary button styling is distinct and used consistently.
- Consistent spacing rhythm (does the app follow a scale — 4/8px multiples — or is padding ad hoc? A 6,900-line single CSS file makes drift likely: sample paddings across pages).
- Alignment: form labels/fields, card grids, list rows share consistent gutters.
- Content max-width on wide screens; line length ≤ ~75 characters for reading text (instructions).

**Typography**
- ≤ 2 typefaces; heading levels visually distinct AND semantically ordered (h1→h2→h3, no skips — check with read_page).
- Body text ≥ 16px on mobile (also prevents iOS zoom-on-focus for inputs).
- No all-caps long text; adequate line-height (~1.5) in instruction steps.

**Color & contrast**
- Text contrast ≥ 4.5:1 (normal) / 3:1 (large & UI components) — sample-check with javascript_tool computed styles on: muted/secondary text, placeholder text, disabled buttons, text over images, nav badge.
- Color never the *only* signal (checked-off items should get strikethrough/position change, not just a color shift).
- Semantic color consistency: one red for destructive/error, one green for success, everywhere.

**Interaction & feedback**
- Every async action has: instant visual acknowledgment (<100ms), loading state if >300ms, success/failure feedback. No dead clicks.
- Buttons disable during in-flight submits (double-submit test on add recipe, cart-add).
- Destructive actions (delete recipe, clear list) require confirmation OR offer undo — one pattern, consistently.
- Hover states on desktop, active/pressed states on touch; cursor: pointer on all clickables.
- Toasts: readable duration, don't cover the action area, stack sanely if 3 fire at once.

**Forms**
- Persistent labels (placeholders are not labels); errors inline next to the field, announced on submit, field keeps user's input on error.
- Correct input types/modes (numeric keypad for quantities on mobile — `inputmode`), autocomplete attributes on auth fields.
- Enter submits single-field forms; Escape closes comboboxes without clearing the field.

**Accessibility (spot-audit, not full WCAG)**
- Keyboard-only pass through one full workflow (add recipe → plan it → shopping list): every control reachable, visible focus ring throughout, no traps.
- Focus management: drawer/modal open moves focus in, close returns it to the trigger.
- read_page (accessibility tree) on each main route: buttons vs. links used semantically, images have alt, icon-only buttons have labels (202 aria attributes exist in the code — verify they're *correct*, not just present).
- Zoom to 200% at 1280px: no content loss or overlap.

**Consistency sweep (cross-page)**
- Same entity, same presentation: does a "recipe card" look identical on List, Discover, Planner, and History? Do the 3 combobox variants look/behave like one component?
- Terminology: is it "meal plan" vs "planner", "shopping list" vs "list", "cook" vs "cooking now" — pick one per concept.
- Icon style consistency (single icon set?); date formats identical everywhere.
- Empty/loading/error state patterns look like siblings across pages.
- kroger.css pages vs. index.css pages: do the ordering pages feel like the same app?

## Phase 5 — Deliverables

Three deliverables, in this order:

**1. Findings document — `docs/ui-audit-findings.md`**
- **Severity rubric:** P0 broken/blocking · P1 misleading or data-loss risk · P2 confusing/friction · P3 polish/cosmetic.
- Each finding: id, severity, route, viewport, repro steps, screenshot, suggested fix, and the checklist item it violates.
- A short "systemic themes" section (e.g., "no consistent empty-state pattern") separate from itemized findings — themes drive refactors, items drive quick fixes.
- Top-10 quick wins list ordered by impact/effort.
- A "skipped/untested" appendix for anything the safety guardrails blocked.

**2. PDF report — `docs/ui-audit-report.pdf`**
- Generate from the findings using the `pdf` skill (invoke the skill — don't hand-roll PDF generation).
- Structure: cover page (app name, date, auditor model, environment), one-page executive summary (counts by severity, top themes, quick wins), then findings grouped by severity with embedded screenshots, then the Phase 2 breakpoint matrix (route × width, pass/fail), then the skipped-tests appendix.
- Keep embedded screenshots sized so the PDF stays reasonably small; full-resolution originals live alongside the markdown in `docs/audit-screenshots/`.

**3. Draft email to Jordan — `jordanepstein96@gmail.com`**
- Create a **Gmail draft** via the connected Gmail tools (`create_draft`) addressed to jordanepstein96@gmail.com. **Draft only — never send.** If the Gmail connector is unavailable in that session, write the email body to `docs/ui-audit-email-draft.md` instead and note it in the report.
- Subject: `Recipe app UI audit — findings report (<date>)`.
- Body: 3–4 short paragraphs — what was audited (routes, breakpoints, workflow count), headline numbers (findings by severity), the 3 most important findings in plain English, and where the full report lives (attach or reference the PDF). Conversational tone, no jargon dump.

**Run-order note:** finish cleanup (guardrail 5) *before* finalizing the deliverables, so any cleanup residue makes it into the report and email.
