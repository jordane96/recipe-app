import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  readFromHistory,
  readFromShopping,
  readSidesListTab,
  recipeDetailPath,
  stripCookModeParams,
} from "./listTabSearch";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  addCookProgressSession,
  cookProgressEntryHref,
  cookProgressSessionKey,
  getFirstActiveCookSessionHref,
  getCookProgressSessions,
  removeCookProgressSession,
  type CookProgressEntry,
} from "./cookProgressSession";
import {
  clearCookModeForRecipeDate,
  displaySecondsForClock,
  ensureCookSessionTotalStarted,
  loadCookSessionTotalPersist,
  loadCookUi,
  readStepClockPersistIfAny,
  loadStepClock,
  saveCookSessionTotalPersist,
  saveCookUi,
  saveStepClock,
  sessionTotalElapsedMs,
  type CookSessionTotalPersist,
  type StepClockPersist,
} from "./cookModeSessionStorage";
import { normalizeInstructions } from "./recipeInstructions";
import { useCookHistory } from "./CookHistoryContext";
import { recipeToPlannedMeal } from "./MealPlanContext";

const SWIPE_PX = 56;

/** Prepended as step 1 in cook mode only. */
const COOK_MODE_INGREDIENTS_CONFIRM_STEP = "Confirm you have all necessary ingredients";

function formatMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type PausePlayGlyphSize = "default" | "compact" | "micro" | "banner";

/** Pause while `isPlaying`; play when paused / idle (step timer) or to resume session total. */
function PausePlayGlyph({
  isPlaying,
  size = "default",
}: {
  isPlaying: boolean;
  size?: PausePlayGlyphSize;
}) {
  const dim = size === "micro" ? 10 : size === "banner" ? 13 : size === "compact" ? 16 : 22;
  const barClass =
    size === "micro"
      ? "cook-mode-v2-timer-ppc-bar cook-mode-v2-timer-ppc-bar--micro"
      : size === "banner"
        ? "cook-mode-v2-timer-ppc-bar cook-mode-v2-timer-ppc-bar--banner"
        : size === "compact"
          ? "cook-mode-v2-timer-ppc-bar cook-mode-v2-timer-ppc-bar--compact"
          : "cook-mode-v2-timer-ppc-bar";
  return (
    <svg
      className="cook-mode-v2-timer-ppc-glyph"
      viewBox="0 0 24 24"
      width={dim}
      height={dim}
      aria-hidden
      focusable="false"
    >
      {isPlaying ? (
        <>
          <line x1="8.5" y1="5" x2="8.5" y2="19" className={barClass} strokeLinecap="round" />
          <line x1="15.5" y1="5" x2="15.5" y2="19" className={barClass} strokeLinecap="round" />
        </>
      ) : (
        <path fill="currentColor" d="M8 5v14l11-7L8 5z" />
      )}
    </svg>
  );
}

/** Figma chip: name (semibold) · qty (medium, muted) when label contains middot. */
function CookChipLabel({ label }: { label: string }) {
  const m = label.match(/^(.+?)(\s*[·•]\s*)(.+)$/);
  if (!m) {
    return <>{label}</>;
  }
  const [, name, sep, qty] = m;
  return (
    <>
      <span className="cook-mode-v2-chip-name">{name}</span>
      <span className="cook-mode-v2-chip-sep">{sep}</span>
      <span className="cook-mode-v2-chip-qty">{qty}</span>
    </>
  );
}

function sessionsMatch(
  e: CookProgressEntry,
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
): boolean {
  const slot = cookSlotRef && cookSlotRef.length > 0 ? cookSlotRef : "";
  return e.recipeId === recipeId && e.cookDate === cookDate && e.slotRef === slot;
}

/** First paint must match persisted step so the save effect cannot overwrite storage with 0 before layout runs. */
function initialActiveStepIndexFromStorage(
  recipe: Recipe,
  cookDate: string,
  cookSlotRef: string | null,
): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const rest = normalizeInstructions(recipe.instructions);
  const max = Math.max(0, rest.length);
  const loaded = loadCookUi(recipe.id, cookDate, cookSlotRef);
  if (
    loaded != null &&
    Number.isFinite(loaded.activeStepIndex) &&
    loaded.activeStepIndex >= 0 &&
    loaded.activeStepIndex <= max
  ) {
    return loaded.activeStepIndex;
  }
  return 0;
}

export function RecipeCookModePanel({
  recipe,
  cookDate,
  cookSlotRef,
  ingredients,
}: {
  recipe: Recipe;
  cookDate: string;
  cookSlotRef: string | null;
  ingredients: IngredientDef[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { logCooked } = useCookHistory();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const cookSteps = React.useMemo(() => {
    const rest = normalizeInstructions(recipe.instructions);
    return [{ text: COOK_MODE_INGREDIENTS_CONFIRM_STEP }, ...rest];
  }, [recipe.instructions]);

  const nSteps = cookSteps.length;

  const [ingredientsExpanded, setIngredientsExpanded] = React.useState(false);
  const [activeStepIndex, setActiveStepIndex] = React.useState(() =>
    initialActiveStepIndexFromStorage(recipe, cookDate, cookSlotRef),
  );
  const [uiTick, setUiTick] = React.useState(0);
  const [touchStartX, setTouchStartX] = React.useState<number | null>(null);
  const [cookProgressListRev, setCookProgressListRev] = React.useState(0);
  /** Persisted session total clock (Total time) + pause state. */
  const [sessionTotalPersist, setSessionTotalPersist] = React.useState<CookSessionTotalPersist | null>(null);

  const hereHref = `${location.pathname}${location.search}`;

  const fullRecipeHref = recipeDetailPath(
    recipe.id,
    readSidesListTab(searchParams),
    stripCookModeParams(searchParams),
    readFromShopping(searchParams),
    readFromHistory(searchParams),
    { cookDate, cookSlotRef },
  );

  React.useLayoutEffect(() => {
    const loaded = loadCookUi(recipe.id, cookDate, cookSlotRef);
    const max = Math.max(0, nSteps - 1);
    const idx =
      loaded != null && loaded.activeStepIndex >= 0 && loaded.activeStepIndex <= max
        ? loaded.activeStepIndex
        : 0;
    setActiveStepIndex(idx);
    setSessionTotalPersist(loadCookSessionTotalPersist(recipe.id, cookDate, cookSlotRef));
  }, [recipe.id, cookDate, cookSlotRef, nSteps]);

  React.useEffect(() => {
    if (activeStepIndex < 1) {
      return;
    }
    const ensured = ensureCookSessionTotalStarted(recipe.id, cookDate, cookSlotRef, Date.now());
    setSessionTotalPersist(ensured);
  }, [activeStepIndex, recipe.id, cookDate, cookSlotRef]);

  React.useEffect(() => {
    const prev = loadCookUi(recipe.id, cookDate, cookSlotRef);
    saveCookUi(recipe.id, cookDate, cookSlotRef, {
      activeStepIndex,
      completedStepIndices: prev?.completedStepIndices ?? [],
    });
  }, [recipe.id, cookDate, cookSlotRef, activeStepIndex]);

  const durationForActive = cookSteps[activeStepIndex]?.durationSeconds ?? 0;
  const [clock, setClock] = React.useState<StepClockPersist | null>(null);

  React.useLayoutEffect(() => {
    if (durationForActive <= 0) {
      setClock(null);
      return;
    }
    setClock(loadStepClock(recipe.id, cookDate, cookSlotRef, activeStepIndex, durationForActive));
  }, [recipe.id, cookDate, cookSlotRef, activeStepIndex, durationForActive]);

  React.useEffect(() => {
    if (!clock || clock.phase !== "running") {
      return;
    }
    const id = window.setInterval(() => setUiTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [clock?.phase, clock?.runEndsAt]);

  React.useEffect(() => {
    if (!clock || clock.phase !== "running" || clock.runEndsAt == null) {
      return;
    }
    const sec = Math.ceil((clock.runEndsAt - Date.now()) / 1000);
    if (sec > 0) {
      return;
    }
    const next: StepClockPersist = {
      ...clock,
      phase: "done",
      runEndsAt: null,
      remainingSeconds: 0,
    };
    saveStepClock(recipe.id, cookDate, cookSlotRef, activeStepIndex, next);
    setClock(next);
  }, [clock, recipe.id, cookDate, cookSlotRef, activeStepIndex]);

  const sessionTotalRunning =
    activeStepIndex >= 1 &&
    sessionTotalPersist != null &&
    sessionTotalPersist.pauseBeganAt == null;

  React.useEffect(() => {
    if (!sessionTotalRunning) {
      return;
    }
    const id = window.setInterval(() => setUiTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sessionTotalRunning]);

  React.useEffect(() => {
    const needVisTick =
      (clock != null && durationForActive > 0) ||
      sessionTotalRunning ||
      (activeStepIndex >= 1 && sessionTotalPersist != null && sessionTotalPersist.pauseBeganAt != null);
    if (!needVisTick) {
      return;
    }
    const onVis = () => {
      if (document.visibilityState === "visible") {
        setUiTick((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [clock, durationForActive, sessionTotalRunning, activeStepIndex, sessionTotalPersist?.pauseBeganAt]);

  React.useEffect(() => {
    const onChange = () => setCookProgressListRev((r) => r + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
  }, []);

  React.useEffect(() => {
    addCookProgressSession(recipe.id, cookDate, cookSlotRef, recipe.title);
  }, [recipe.id, cookDate, cookSlotRef, recipe.title]);

  void cookProgressListRev;

  /** Re-tick every 1s so “Also running” step timers stay accurate while viewing another session */
  const [dockTick, setDockTick] = React.useState(0);
  React.useEffect(() => {
    const id = window.setInterval(() => setDockTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sessionPills = React.useMemo(() => {
    const sessions = getCookProgressSessions();
    const sorted = [...sessions].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    );
    return sorted.map((entry) => ({
      key: cookProgressSessionKey(entry),
      href: cookProgressEntryHref(entry),
      title: entry.title,
      recipeId: entry.recipeId,
      cookDate: entry.cookDate,
      slotRef: entry.slotRef,
      current: sessionsMatch(entry, recipe.id, cookDate, cookSlotRef),
    }));
  }, [hereHref, cookProgressListRev, recipe.id, cookDate, cookSlotRef]);

  const dockSessions = React.useMemo(() => {
    const now = Date.now();
    const out: { key: string; href: string; title: string; timerText: string }[] = [];
    for (const p of sessionPills) {
      if (p.current) {
        continue;
      }
      const slot = p.slotRef.length > 0 ? p.slotRef : null;
      const ui = loadCookUi(p.recipeId, p.cookDate, slot);
      const step = ui?.activeStepIndex ?? 0;
      const clock = readStepClockPersistIfAny(p.recipeId, p.cookDate, slot, step);
      if (clock == null) {
        continue;
      }
      if (clock.phase !== "running" && clock.phase !== "paused") {
        continue;
      }
      out.push({
        key: p.key,
        href: p.href,
        title: p.title,
        timerText: formatMSS(displaySecondsForClock(clock, now)),
      });
    }
    return out;
  }, [sessionPills, dockTick]);

  const switchToCookSession = (targetHref: string) => {
    if (targetHref === hereHref) {
      return;
    }
    navigate(targetHref);
  };

  const flatIngredientChips = React.useMemo(() => {
    const out: { key: string; label: string }[] = [];
    for (const sec of recipe.ingredientSections ?? []) {
      for (let i = 0; i < sec.lines.length; i++) {
        const line = sec.lines[i];
        out.push({
          key: `${sec.name}-${i}-${line.ingredientId}`,
          label: formatIngredientLine(line, byId),
        });
      }
    }
    return out;
  }, [recipe.ingredientSections, byId]);

  /** Step-scoped labels when author provided `stepIngredients`; otherwise cook mode falls back to full recipe chips. */
  const stepIngredientChips = React.useMemo(() => {
    const labels = cookSteps[activeStepIndex]?.stepIngredients;
    if (!labels?.length) {
      return null;
    }
    return labels.map((label, i) => ({ key: `step-ing-${i}-${label}`, label }));
  }, [cookSteps, activeStepIndex]);

  const goStep = (delta: number) => {
    setActiveStepIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, nSteps - 1)));
  };

  const persistClock = (next: StepClockPersist) => {
    saveStepClock(recipe.id, cookDate, cookSlotRef, activeStepIndex, next);
    setClock(next);
  };

  const onStartTimer = () => {
    if (!clock || durationForActive <= 0) {
      return;
    }
    const now = Date.now();
    if (clock.phase === "running") {
      return;
    }
    if (clock.phase === "done" || clock.phase === "idle") {
      const total = clock.phase === "done" ? durationForActive : clock.totalSeconds;
      persistClock({
        phase: "running",
        totalSeconds: total,
        runEndsAt: now + total * 1000,
        remainingSeconds: null,
      });
      return;
    }
    if (clock.phase === "paused" && clock.remainingSeconds != null) {
      persistClock({
        ...clock,
        phase: "running",
        runEndsAt: now + clock.remainingSeconds * 1000,
        remainingSeconds: null,
      });
    }
  };

  const onToggleSessionTotalPause = () => {
    if (activeStepIndex < 1 || sessionTotalPersist == null) {
      return;
    }
    const now = Date.now();
    let next: CookSessionTotalPersist;
    if (sessionTotalPersist.pauseBeganAt == null) {
      next = { ...sessionTotalPersist, pauseBeganAt: now };
    } else {
      next = {
        ...sessionTotalPersist,
        totalPausedMs: sessionTotalPersist.totalPausedMs + (now - sessionTotalPersist.pauseBeganAt),
        pauseBeganAt: null,
      };
    }
    saveCookSessionTotalPersist(recipe.id, cookDate, cookSlotRef, next);
    setSessionTotalPersist(next);
  };

  const onTapReadout = () => {
    if (!clock || durationForActive <= 0) {
      return;
    }
    if (clock.phase === "idle" || clock.phase === "done") {
      onStartTimer();
      return;
    }
    if (clock.phase === "running" && clock.runEndsAt != null) {
      const remaining = Math.max(0, Math.ceil((clock.runEndsAt - Date.now()) / 1000));
      persistClock({
        ...clock,
        phase: "paused",
        runEndsAt: null,
        remainingSeconds: remaining,
      });
      return;
    }
    if (clock.phase === "paused") {
      onStartTimer();
    }
  };

  const onAdd30Sec = () => {
    if (!clock || durationForActive <= 0) {
      return;
    }
    if (clock.phase === "running" && clock.runEndsAt != null) {
      persistClock({ ...clock, runEndsAt: clock.runEndsAt + 30_000 });
      return;
    }
    if (clock.phase === "paused" && clock.remainingSeconds != null) {
      persistClock({
        ...clock,
        remainingSeconds: clock.remainingSeconds + 30,
        totalSeconds: clock.totalSeconds + 30,
      });
      return;
    }
    persistClock({ ...clock, totalSeconds: clock.totalSeconds + 30 });
  };

  const onSubtract30Sec = () => {
    if (!clock || durationForActive <= 0) {
      return;
    }
    if (clock.phase === "running" && clock.runEndsAt != null) {
      const floor = Date.now() + 1000;
      persistClock({ ...clock, runEndsAt: Math.max(floor, clock.runEndsAt - 30_000) });
      return;
    }
    if (clock.phase === "paused" && clock.remainingSeconds != null) {
      persistClock({
        ...clock,
        remainingSeconds: Math.max(0, clock.remainingSeconds - 30),
        totalSeconds: Math.max(30, clock.totalSeconds - 30),
      });
      return;
    }
    persistClock({ ...clock, totalSeconds: Math.max(30, clock.totalSeconds - 30) });
  };

  const clearCookSessionState = () => {
    clearCookModeForRecipeDate(recipe.id, cookDate);
    removeCookProgressSession(recipe.id, cookDate, cookSlotRef);
  };

  /** “It’s ready!” — log the meal, then return to the planner home. */
  const exitCookModeToMenu = () => {
    clearCookSessionState();
    navigate("/");
  };

  /** Cancel this cook session: go to another in-progress session, or the “nothing cooking” page. */
  const onCancelCooking = () => {
    clearCookSessionState();
    const next = getFirstActiveCookSessionHref();
    if (next) {
      navigate(next);
    } else {
      navigate("/cooking-now");
    }
  };

  const onItsReady = () => {
    const meal = recipeToPlannedMeal(recipe);
    logCooked(cookDate, {
      ...meal,
      ...(cookSlotRef && cookSlotRef.length > 0 ? { planSlotRef: cookSlotRef } : {}),
    });
    exitCookModeToMenu();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.changedTouches[0]?.clientX ?? null);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX == null) {
      return;
    }
    const endX = e.changedTouches[0]?.clientX;
    if (endX == null) {
      setTouchStartX(null);
      return;
    }
    const dx = endX - touchStartX;
    setTouchStartX(null);
    if (dx > SWIPE_PX) {
      goStep(-1);
    } else if (dx < -SWIPE_PX) {
      goStep(1);
    }
  };

  void uiTick;
  const displaySeconds =
    clock && durationForActive > 0 ? displaySecondsForClock(clock, Date.now()) : 0;
  const elapsedSessionSeconds =
    activeStepIndex >= 1 && sessionTotalPersist != null
      ? Math.floor(sessionTotalElapsedMs(sessionTotalPersist, Date.now()) / 1000)
      : 0;
  const isConfirmStep = activeStepIndex === 0;
  const showSessionInBanner = !isConfirmStep && activeStepIndex >= 1 && sessionTotalPersist != null;
  const stepText = cookSteps[activeStepIndex]?.text ?? "";
  /** Recipe instruction steps only (excludes leading confirm step) — drives “Step 1 of N” labels. */
  const nCookSteps = Math.max(1, nSteps - 1);
  /** 1-based index among cook steps; equals `activeStepIndex` once past confirm. */
  const displayedCookStep = activeStepIndex >= 1 ? activeStepIndex : 1;
  const stepProgressFrac =
    !isConfirmStep && nCookSteps > 0 ? Math.min(1, activeStepIndex / nCookSteps) : 0;
  const isLastCookStep = activeStepIndex >= 1 && activeStepIndex === nSteps - 1;

  const sessionPillsRow = (
    <div className="cook-mode-v2-pills" role="group" aria-label="Active recipes">
      {sessionPills.map((p) => (
        <button
          key={p.key}
          type="button"
          aria-pressed={p.current}
          className={`cook-mode-v2-pill${p.current ? " cook-mode-v2-pill--selected" : ""}`}
          onClick={() => switchToCookSession(p.href)}
        >
          {p.current ? (
            <>
              <span className="cook-mode-v2-pill-dot" aria-hidden />
              <span className="cook-mode-v2-pill-label">{p.title}</span>
            </>
          ) : (
            <span className="cook-mode-v2-pill-label">{p.title}</span>
          )}
        </button>
      ))}
      <Link to="/" className="cook-mode-v2-pill cook-mode-v2-pill--add">
        + Add
      </Link>
    </div>
  );

  return (
    <div className="cook-mode-v2">
      {!isConfirmStep ? (
        <div
          className="cook-mode-v2-session-progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={nCookSteps}
          aria-valuenow={displayedCookStep}
          aria-label="Progress through cook steps"
        >
          <div className="cook-mode-v2-session-progress-fill" style={{ width: `${stepProgressFrac * 100}%` }} />
        </div>
      ) : null}

      {sessionPillsRow}

      <article
        className={`cook-mode-v2-main-card${isConfirmStep ? " cook-mode-v2-main-card--confirm" : ""}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="region"
        aria-roledescription={isConfirmStep ? undefined : "slide"}
        aria-label={
          isConfirmStep
            ? "Confirm ingredients before cooking"
            : `Step ${displayedCookStep} of ${nCookSteps}`
        }
      >
        {isConfirmStep ? (
          <>
            <div className="cook-mode-v2-confirm-scroll">
              <div className="cook-mode-v2-cook-chrome cook-mode-v2-cook-chrome--confirm">
                <div
                  className="cook-mode-v2-meal-banner cook-mode-v2-meal-banner--static cook-mode-v2-meal-banner--in-chrome"
                  role="banner"
                >
                  <span className="cook-mode-v2-meal-banner-title cook-mode-v2-meal-banner-title--solo">{recipe.title}</span>
                </div>
              </div>
              <h1 className="cook-mode-v2-confirm-title">{COOK_MODE_INGREDIENTS_CONFIRM_STEP}</h1>
              {flatIngredientChips.length > 0 ? (
                <section className="cook-mode-v2-confirm-ing" aria-label="Ingredients for this recipe">
                  <div className="cook-mode-v2-confirm-ing-label">Ingredients for this recipe</div>
                  <div className="cook-mode-v2-chip-row cook-mode-v2-confirm-chip-row">
                    {flatIngredientChips.map((c) => (
                      <span key={c.key} className="cook-mode-v2-chip">
                        <CookChipLabel label={c.label} />
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
            <div className="cook-mode-v2-confirm-footer">
              <div className="cook-mode-v2-confirm-divider" aria-hidden />
              <div className="cook-mode-v2-confirm-actions">
                <button
                  type="button"
                  className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--primary"
                  onClick={() => goStep(1)}
                >
                  Start cooking
                </button>
                <Link to={fullRecipeHref} className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--outline">
                  View recipe
                </Link>
              </div>
              <button type="button" className="cook-mode-v2-confirm-cancel" onClick={onCancelCooking}>
                Cancel cooking
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cook-mode-v2-cook-main-scroll">
              {/* Figma 44:77 — "Airy — Text first": teal strip = recipe title + session clock only */}
              <div className="cook-mode-v2-cook-chrome cook-mode-v2-cook-chrome--top">
                {showSessionInBanner ? (
                  <button
                    type="button"
                    className="cook-mode-v2-meal-banner cook-mode-v2-meal-banner--interactive cook-mode-v2-meal-banner--in-chrome"
                    onClick={onToggleSessionTotalPause}
                    aria-label={
                      sessionTotalPersist!.pauseBeganAt == null ? "Pause cook session clock" : "Resume cook session clock"
                    }
                  >
                    <span className="cook-mode-v2-meal-banner-spacer" aria-hidden />
                    <span className="cook-mode-v2-meal-banner-title">{recipe.title}</span>
                    <span className="cook-mode-v2-meal-banner-right">
                      <span className="cook-mode-v2-meal-banner-time">{formatMSS(elapsedSessionSeconds)}</span>
                      <PausePlayGlyph isPlaying={sessionTotalPersist!.pauseBeganAt == null} size="banner" />
                    </span>
                  </button>
                ) : (
                  <div className="cook-mode-v2-meal-banner cook-mode-v2-meal-banner--static cook-mode-v2-meal-banner--in-chrome" role="banner">
                    <span className="cook-mode-v2-meal-banner-title cook-mode-v2-meal-banner-title--solo">{recipe.title}</span>
                  </div>
                )}
              </div>

              <div className="cook-mode-v2-cook-body">
            <p className="cook-mode-v2-step-text">{stepText}</p>
            <div className="cook-mode-v2-step-rule" aria-hidden />

            {stepIngredientChips != null && stepIngredientChips.length > 0 ? (
              <section className="cook-mode-v2-ing-block" aria-label="Ingredients for this step">
                <div className="cook-mode-v2-ing-head">
                  <span className="cook-mode-v2-ing-label">Ingredients for this step</span>
                  {flatIngredientChips.length > 0 ? (
                    <button
                      type="button"
                      className="cook-mode-v2-view-all"
                      onClick={() => setIngredientsExpanded((e) => !e)}
                    >
                      {ingredientsExpanded ? "Hide" : "View all"}
                    </button>
                  ) : null}
                </div>
                <div className="cook-mode-v2-chip-row">
                  {stepIngredientChips.map((c) => (
                    <span key={c.key} className="cook-mode-v2-chip">
                      <CookChipLabel label={c.label} />
                    </span>
                  ))}
                </div>
                {ingredientsExpanded && flatIngredientChips.length > 0 ? (
                  <div className="cook-mode-v2-ing-expanded muted">
                    {recipe.ingredientSections?.map((sec) => (
                      <div key={sec.name}>
                        <strong className="cook-mode-v2-ing-sec-name">{sec.name}</strong>
                        <ul className="cook-mode-v2-ing-list">
                          {sec.lines.map((line, i) => (
                            <li key={`${line.ingredientId}-${i}`}>{formatIngredientLine(line, byId)}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : flatIngredientChips.length > 0 ? (
              <section className="cook-mode-v2-ing-block" aria-label="All recipe ingredients">
                <div className="cook-mode-v2-ing-head">
                  <span className="cook-mode-v2-ing-label">All ingredients</span>
                  <button
                    type="button"
                    className="cook-mode-v2-view-all"
                    onClick={() => setIngredientsExpanded((e) => !e)}
                  >
                    {ingredientsExpanded ? "Hide" : "View all"}
                  </button>
                </div>
                <div className="cook-mode-v2-chip-row">
                  {flatIngredientChips.slice(0, 4).map((c) => (
                    <span key={c.key} className="cook-mode-v2-chip">
                      <CookChipLabel label={c.label} />
                    </span>
                  ))}
                </div>
                {ingredientsExpanded ? (
                  <div className="cook-mode-v2-ing-expanded muted">
                    {recipe.ingredientSections?.map((sec) => (
                      <div key={sec.name}>
                        <strong className="cook-mode-v2-ing-sec-name">{sec.name}</strong>
                        <ul className="cook-mode-v2-ing-list">
                          {sec.lines.map((line, i) => (
                            <li key={`${line.ingredientId}-${i}`}>{formatIngredientLine(line, byId)}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {clock && durationForActive > 0 ? (
              <>
                <div className="cook-mode-v2-step-rule cook-mode-v2-step-rule--before-timer" aria-hidden />
                <section className="cook-mode-v2-timer" aria-label="Step timer">
                  <div className="cook-mode-v2-timer-layout">
                    <button
                      type="button"
                      className="cook-mode-v2-timer-main"
                      onClick={onTapReadout}
                      aria-label={
                        clock.phase === "running"
                          ? "Pause step timer"
                          : clock.phase === "paused"
                            ? "Resume step timer"
                            : clock.phase === "done"
                              ? "Restart step timer"
                              : "Start step timer"
                      }
                    >
                      <span className="cook-mode-v2-timer-main-digits-wrap">
                        <span className="cook-mode-v2-timer-main-digits">{formatMSS(displaySeconds)}</span>
                      </span>
                      <span className="cook-mode-v2-timer-main-action">
                        {clock.phase === "running"
                          ? "Pause"
                          : clock.phase === "paused"
                            ? "Resume"
                            : "Start"}
                      </span>
                    </button>
                    <div className="cook-mode-v2-timer-adjusts">
                      <button
                        type="button"
                        className="cook-mode-v2-timer-adjust"
                        onClick={onAdd30Sec}
                        aria-label="Add 30 seconds to step timer"
                      >
                        + 30 sec
                      </button>
                      <button
                        type="button"
                        className="cook-mode-v2-timer-adjust"
                        onClick={onSubtract30Sec}
                        aria-label="Subtract 30 seconds from step timer"
                      >
                        - 30 sec
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {isLastCookStep ? (
              <div className="cook-mode-v2-last-step-cta">
                <button
                  type="button"
                  className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--primary"
                  onClick={onItsReady}
                >
                  {"It's ready"}
                </button>
              </div>
            ) : null}
              </div>
            </div>

            <div className="cook-mode-v2-cook-footer">
              <div className="cook-mode-v2-cook-header-nav" aria-label="Step navigation">
                <button
                  type="button"
                  className="cook-mode-v2-nav-btn cook-mode-v2-nav-btn--figma cook-mode-v2-nav-btn--figma-airy"
                  aria-label="Previous step"
                  disabled={activeStepIndex <= 0}
                  onClick={() => goStep(-1)}
                >
                  <span className="cook-mode-v2-nav-arrow" aria-hidden>
                    ←
                  </span>
                </button>
                <div className="cook-mode-v2-cook-header-mid">
                  <p className="cook-mode-v2-cook-header-step-label">
                    Step {displayedCookStep} of {nCookSteps}
                  </p>
                  <div className="cook-mode-v2-dots" role="tablist" aria-label="Cook steps">
                    {cookSteps.slice(1).map((_, displayIdx) => {
                      const i = displayIdx + 1;
                      const displayStep = displayIdx + 1;
                      const done = i < activeStepIndex;
                      const current = i === activeStepIndex;
                      return (
                        <button
                          key={i}
                          type="button"
                          role="tab"
                          aria-selected={current}
                          className={`cook-mode-v2-dot${current ? " cook-mode-v2-dot--active" : ""}${done ? " cook-mode-v2-dot--completed" : ""}`}
                          aria-label={`Go to step ${displayStep}`}
                          onClick={() => setActiveStepIndex(i)}
                        />
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className="cook-mode-v2-nav-btn cook-mode-v2-nav-btn--figma cook-mode-v2-nav-btn--figma-airy"
                  aria-label="Next step"
                  disabled={activeStepIndex >= nSteps - 1}
                  onClick={() => goStep(1)}
                >
                  <span className="cook-mode-v2-nav-arrow" aria-hidden>
                    →
                  </span>
                </button>
              </div>
              <div className="cook-mode-v2-cook-bottom">
                <button type="button" className="cook-mode-v2-confirm-cancel cook-mode-v2-footer-cancel" onClick={onCancelCooking}>
                  Cancel cooking
                </button>
              </div>
            </div>
          </>
        )}
      </article>

      {dockSessions.length > 0 ? (
        <aside className="cook-mode-v2-dock" aria-label="Other active cooks">
          <p className="cook-mode-v2-dock-label">Also running</p>
          <div className="cook-mode-v2-dock-cards">
            {dockSessions.map((p) => (
              <button
                key={p.key}
                type="button"
                className="cook-mode-v2-dock-card"
                onClick={() => switchToCookSession(p.href)}
              >
                <span className="cook-mode-v2-dock-card-title">{p.title}</span>
                <span className="cook-mode-v2-dock-card-timer" aria-label={`Step timer ${p.timerText}`}>
                  {p.timerText}
                </span>
                <span className="cook-mode-v2-dock-card-sub">Tap to switch</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

    </div>
  );
}
