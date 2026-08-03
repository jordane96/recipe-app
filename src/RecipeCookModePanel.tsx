import * as React from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMapWithRecipes, scaleIngredientLine } from "./ingredientDisplay";
import { useWakeLock } from "./useWakeLock";
import { playTimerAlert, stopTimerAlert, unlockTimerAudio } from "./timerAlert";
import {
  EDIT_RECIPE_STEP_QUERY,
  recipeEditPath,
  recipesAddMealForCookingPath,
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
  loadCookServings,
  saveCookServings,
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
import { iso, startOfWeekMonday } from "./mealPlanDates";
import { normalizeInstructions } from "./recipeInstructions";
import { useCookHistory } from "./CookHistoryContext";
import { recipeSegment } from "./recipeCourse";
import { useMealPlan } from "./MealPlanContext";
import { portionCountOf } from "./mealPlanStorage";

const SWIPE_PX = 56;

/**
 * Swipe handlers on `<article>` bubble from nested buttons; touch-start updates state there and can
 * cancel the subsequent click on mobile. Stop propagation so taps hit only the nested control.
 */
const isolateNestedTouchFromSwipePaneProps = {
  onTouchStart: (e: React.TouchEvent) => {
    e.stopPropagation();
  },
  onTouchEnd: (e: React.TouchEvent) => {
    e.stopPropagation();
  },
} as const;

/** Prepended as step 1 in cook mode only (internal step label). */
const COOK_MODE_INGREDIENTS_CONFIRM_STEP = "Confirm you have all necessary ingredients";

/**
 * Visible heading on the confirm card before "Start cooking". Deliberately just "Overview" —
 * "Recipe overview" was wide enough to push the servings stepper onto its own line on a phone,
 * and the recipe name is already in the teal strip directly above it.
 */
const COOK_MODE_CONFIRM_OVERVIEW_TITLE = "Overview";

function formatMSS(totalSeconds: number): string {
  // At >= 1h the M:SS form gets too wide for the timer container (long bakes / braises).
  // Drop seconds and switch to "Xh" / "Xh Ym" so the display stays inside its slot.
  if (totalSeconds >= 3600) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
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
  const { plan, unassignedKey } = useMealPlan();
  // Keep the screen awake the whole time the cook panel is mounted so the recipe stays
  // visible and step timers keep ticking in the foreground. Released automatically on exit.
  useWakeLock(true);
  // Recipe-aware so custom-* ids render as human names during cook mode.
  const byId = React.useMemo(
    () => ingredientMapWithRecipes(ingredients, [recipe]),
    [ingredients, recipe],
  );

  /** Same target as "Browse recipes" on the empty Cooking now page — list with add-to-menu + cook on add. */
  const addRecipeToCookListHref = React.useMemo(
    () => recipesAddMealForCookingPath(iso(startOfWeekMonday(new Date()))),
    [],
  );

  const cookSteps = React.useMemo(() => {
    const rest = normalizeInstructions(recipe.instructions);
    return [{ text: COOK_MODE_INGREDIENTS_CONFIRM_STEP }, ...rest];
  }, [recipe.instructions]);

  const nSteps = cookSteps.length;

  const [activeStepIndex, setActiveStepIndex] = React.useState(() =>
    initialActiveStepIndexFromStorage(recipe, cookDate, cookSlotRef),
  );
  const [uiTick, setUiTick] = React.useState(0);
  const [touchStartX, setTouchStartX] = React.useState<number | null>(null);
  const [cookProgressListRev, setCookProgressListRev] = React.useState(0);
  /** Persisted session total clock (Total time) + pause state. */
  const [sessionTotalPersist, setSessionTotalPersist] = React.useState<CookSessionTotalPersist | null>(null);
  const [cookIngredientsOpen, setCookIngredientsOpen] = React.useState(false);

  // Servings for this cook session: drives ingredient scaling and the servings logged on "It's
  // ready". Defaults to the plan slot's servings (or the recipe's base), and is remembered per
  // session. Ingredient amounts scale by cookServings / base; with no base servings, scale is 1.
  // The slot we're cooking can live on the calendar day (planner "Cook now") or in the menu's
  // unassigned pool ("Cook now" from the menu). Match its planSlotRef in either place.
  const slotMeal = React.useMemo(() => {
    if (!cookSlotRef) {
      return undefined;
    }
    const dayMeals = plan[cookDate] ?? [];
    const menuMeals = plan[unassignedKey] ?? [];
    return (
      dayMeals.find((m) => m.planSlotRef === cookSlotRef) ??
      menuMeals.find((m) => m.planSlotRef === cookSlotRef)
    );
  }, [plan, cookDate, cookSlotRef, unassignedKey]);
  const baseServings =
    typeof recipe.servings === "number" && recipe.servings > 0 ? recipe.servings : null;
  // Default servings derive *reactively* from the slot (or recipe base / 1). Don't capture this in
  // a once-only useState initializer — the slot may not be resolved on the very first render, and a
  // wrong value would then get persisted and stick. We only persist an explicit user override.
  const slotDefaultServings = slotMeal ? portionCountOf(slotMeal) : baseServings ?? 1;
  const [servingsOverride, setServingsOverride] = React.useState<number | null>(() =>
    loadCookServings(recipe.id, cookDate, cookSlotRef),
  );
  const cookServings = servingsOverride ?? slotDefaultServings;
  React.useEffect(() => {
    if (servingsOverride != null) {
      saveCookServings(recipe.id, cookDate, cookSlotRef, servingsOverride);
    }
  }, [recipe.id, cookDate, cookSlotRef, servingsOverride]);
  const ingredientScale = baseServings ? cookServings / baseServings : 1;
  const [celebrationOpen, setCelebrationOpen] = React.useState(false);
  const celebrationExitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrationExitOnceRef = React.useRef(false);

  const hereHref = `${location.pathname}${location.search}`;

  const openEditRecipeForCurrentStep = React.useCallback(() => {
    const stripped = stripCookModeParams(searchParams);
    const cookReturn = { cookDate, cookSlotRef };
    const base = recipeEditPath(recipe.id, stripped, cookReturn);
    const recipeStepIndex = activeStepIndex >= 1 ? activeStepIndex - 1 : 0;
    const u = new URL(base, window.location.origin);
    u.searchParams.set(EDIT_RECIPE_STEP_QUERY, String(recipeStepIndex));
    navigate(`${u.pathname}${u.search}`);
  }, [activeStepIndex, cookDate, cookSlotRef, navigate, recipe.id, searchParams]);

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
    const transitionToDone = () => {
      const next: StepClockPersist = {
        ...clock,
        phase: "done",
        runEndsAt: null,
        remainingSeconds: 0,
      };
      saveStepClock(recipe.id, cookDate, cookSlotRef, activeStepIndex, next);
      setClock(next);
    };
    const msUntilExpiry = clock.runEndsAt - Date.now();
    if (msUntilExpiry <= 0) {
      // Already expired (e.g. reopening a timer that finished earlier / in a prior session).
      // Transition silently — don't alert for an expiry the user already missed.
      transitionToDone();
      return;
    }
    // Schedule a transition at the exact expiry moment so phase flips to "done" on its own,
    // not on the next user interaction. Without this, the UI shows "0:00 Pause" until tapped.
    // This is the genuine "timer just finished while you were watching" moment — alert here.
    const id = window.setTimeout(() => {
      transitionToDone();
      playTimerAlert();
    }, msUntilExpiry);
    return () => window.clearTimeout(id);
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

  /** Re-tick every 1s so "Also running" step timers stay accurate while viewing another session */
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

  /** Per–non-current session: running/paused step timer readout (same as former bottom dock). */
  const sessionPillsWithTimers = React.useMemo(() => {
    const now = Date.now();
    return sessionPills.map((p) => {
      if (p.current) {
        return { ...p, timerText: null as string | null };
      }
      const slot = p.slotRef.length > 0 ? p.slotRef : null;
      const ui = loadCookUi(p.recipeId, p.cookDate, slot);
      const step = ui?.activeStepIndex ?? 0;
      const clock = readStepClockPersistIfAny(p.recipeId, p.cookDate, slot, step);
      if (clock == null || (clock.phase !== "running" && clock.phase !== "paused")) {
        return { ...p, timerText: null };
      }
      return { ...p, timerText: formatMSS(displaySecondsForClock(clock, now)) };
    });
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

  const goStep = (delta: number) => {
    // Moving to another step also acknowledges/silences a ringing alarm.
    stopTimerAlert();
    setActiveStepIndex((i) => Math.min(Math.max(0, i + delta), Math.max(0, nSteps - 1)));
  };

  /**
   * Start each step at the top.
   *
   * Changing step is internal state, not a route change, so App.tsx's navigation snap-to-top
   * never fires here — you'd read down the overview's ingredient list, press "Start cooking",
   * and land halfway down step 1 at whatever offset you'd scrolled to. Same on every → / ← and
   * on the step dots.
   *
   * `useLayoutEffect` so it lands before paint rather than as a visible jump, and the scroll
   * containers are reset alongside the window because cook mode's card can be the scroller
   * depending on viewport (see the same belt-and-braces in App.tsx).
   */
  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    document
      .querySelectorAll<HTMLElement>(".app-shell, .cook-mode-v2-cook-main-scroll, .cook-mode-v2-confirm-scroll")
      .forEach((el) => {
        if (el.scrollTop !== 0) el.scrollTop = 0;
      });
  }, [activeStepIndex]);

  const persistClock = (next: StepClockPersist) => {
    saveStepClock(recipe.id, cookDate, cookSlotRef, activeStepIndex, next);
    setClock(next);
  };

  const onStartTimer = () => {
    if (!clock || durationForActive <= 0) {
      return;
    }
    // This runs inside the user's tap — prime audio so the expiry beep can fire later (iOS
    // only allows programmatic audio after a gesture has unlocked the AudioContext).
    unlockTimerAudio();
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
    // Any tap on the timer acknowledges/silences a ringing alarm.
    stopTimerAlert();
    if (clock.phase === "done") {
      // "Stop": silence + reset to full duration, idle (not running). The readout then shows
      // the full time with "Start", so the user can run it again if they choose.
      persistClock({
        phase: "idle",
        totalSeconds: durationForActive,
        runEndsAt: null,
        remainingSeconds: null,
      });
      return;
    }
    if (clock.phase === "idle") {
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
    if (clock.phase === "done") {
      // Timer finished but the user wants more time — flip back to paused with 30s on the clock,
      // so the display shows "0:30 Resume" and a tap re-starts. Without this, +30 in done phase
      // bumps totalSeconds invisibly (displaySecondsForClock returns 0 for done) and looks broken.
      persistClock({
        phase: "paused",
        totalSeconds: clock.totalSeconds + 30,
        runEndsAt: null,
        remainingSeconds: 30,
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

  const clearCookSessionState = React.useCallback(() => {
    clearCookModeForRecipeDate(recipe.id, cookDate);
    removeCookProgressSession(recipe.id, cookDate, cookSlotRef);
  }, [recipe.id, cookDate, cookSlotRef]);

  /** After celebration (or skip), clear session and return to the planner home. */
  const exitCookModeToMenu = React.useCallback(() => {
    clearCookSessionState();
    navigate("/");
  }, [clearCookSessionState, navigate]);

  const finishCelebrationAndExit = React.useCallback(() => {
    if (celebrationExitOnceRef.current) {
      return;
    }
    celebrationExitOnceRef.current = true;
    if (celebrationExitTimerRef.current != null) {
      clearTimeout(celebrationExitTimerRef.current);
      celebrationExitTimerRef.current = null;
    }
    setCelebrationOpen(false);
    exitCookModeToMenu();
  }, [exitCookModeToMenu]);

  React.useEffect(() => {
    if (!celebrationOpen) {
      return;
    }
    const ms =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 1400
        : 4500;
    celebrationExitTimerRef.current = window.setTimeout(() => {
      celebrationExitTimerRef.current = null;
      finishCelebrationAndExit();
    }, ms);
    return () => {
      if (celebrationExitTimerRef.current != null) {
        clearTimeout(celebrationExitTimerRef.current);
        celebrationExitTimerRef.current = null;
      }
    };
  }, [celebrationOpen, finishCelebrationAndExit]);

  /** Cancel this cook session: go to another in-progress session, or the "nothing cooking" page. */
  const onCancelCooking = () => {
    clearCookSessionState();
    const next = getFirstActiveCookSessionHref();
    if (next) {
      navigate(next);
    } else {
      navigate("/cooking-now");
    }
  };

  /** Log cooked, then full-screen celebration before returning home. */
  const onItsReady = () => {
    if (celebrationOpen) {
      return;
    }
    celebrationExitOnceRef.current = false;
    flushSync(() => {
      logCooked(cookDate, {
        id: recipe.id,
        title: recipe.title,
        kind: recipeSegment(recipe) === "side" ? "side" : "main",
        ...(cookSlotRef ? { planSlotRef: cookSlotRef } : {}),
        // The servings the user is actually cooking (stepper value, defaulted from the slot).
        servings: cookServings,
      });
    });
    setCelebrationOpen(true);
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
  const stepNote = !isConfirmStep ? cookSteps[activeStepIndex]?.note : undefined;
  /** Recipe instruction steps only (excludes leading confirm step) — drives "Step 1 of N" labels. */
  const nCookSteps = Math.max(1, nSteps - 1);
  /** 1-based index among cook steps; equals `activeStepIndex` once past confirm. */
  const displayedCookStep = activeStepIndex >= 1 ? activeStepIndex : 1;
  const stepProgressFrac =
    !isConfirmStep && nCookSteps > 0 ? Math.min(1, activeStepIndex / nCookSteps) : 0;
  const isLastCookStep = activeStepIndex >= 1 && activeStepIndex === nSteps - 1;

  /** Recipe steps only (no synthetic confirm row) — shown on the ingredients confirm screen. */
  const recipeInstructionSteps = cookSteps.slice(1);

  const sessionPillsRow = (
    <div className="cook-mode-v2-pills" role="group" aria-label="Active recipes">
      {sessionPillsWithTimers.map((p) => {
        const showOtherTimer = !p.current && p.timerText != null;
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.current}
            className={`cook-mode-v2-pill${p.current ? " cook-mode-v2-pill--selected" : ""}${
              showOtherTimer ? " cook-mode-v2-pill--with-timer" : ""
            }`}
            onClick={() => switchToCookSession(p.href)}
          >
            {p.current ? (
              <>
                <span className="cook-mode-v2-pill-dot" aria-hidden />
                <span className="cook-mode-v2-pill-label">{p.title}</span>
              </>
            ) : showOtherTimer ? (
              <>
                <span className="cook-mode-v2-pill-label">{p.title}</span>
                <span
                  className="cook-mode-v2-pill-timer"
                  aria-label={`Step timer for ${p.title}: ${p.timerText}`}
                >
                  {p.timerText}
                </span>
              </>
            ) : (
              <span className="cook-mode-v2-pill-label">{p.title}</span>
            )}
          </button>
        );
      })}
      <Link
        to={addRecipeToCookListHref}
        className="cook-mode-v2-pill cook-mode-v2-pill--add"
        aria-label="Browse recipes to choose a meal to cook"
      >
        + Add
      </Link>
    </div>
  );

  const servingsStepper = (
    <div className="cook-mode-v2-servings" role="group" aria-label="Servings for this cook">
      <button
        type="button"
        className="cook-mode-v2-servings-btn"
        aria-label="Decrease servings"
        onClick={() => setServingsOverride(Math.max(1, cookServings - 1))}
      >
        −
      </button>
      <span className="cook-mode-v2-servings-value">
        {cookServings} {cookServings === 1 ? "serving" : "servings"}
      </span>
      <button
        type="button"
        className="cook-mode-v2-servings-btn"
        aria-label="Increase servings"
        onClick={() => setServingsOverride(Math.min(99, cookServings + 1))}
      >
        +
      </button>
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
            ? COOK_MODE_CONFIRM_OVERVIEW_TITLE
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
              <div className="cook-mode-v2-overview-head">
                {/* Section heading, not the page heading — the app chrome title is the h1 on
                    cook-mode routes (see chromeTitleIsPageHeading in App.tsx). */}
                <h2 className="cook-mode-v2-confirm-title">{COOK_MODE_CONFIRM_OVERVIEW_TITLE}</h2>
                {servingsStepper}
              </div>
              {flatIngredientChips.length > 0 ? (
                <>
                  <div className="cook-mode-v2-confirm-ing-rule-line" aria-hidden />
                  <section
                    className="cook-mode-v2-ing-block cook-mode-v2-confirm-ing"
                    aria-labelledby={`cook-ingredients-heading-confirm-${recipe.id}`}
                  >
                    <h2 className="cook-mode-v2-ing-heading" id={`cook-ingredients-heading-confirm-${recipe.id}`}>
                      Ingredients
                    </h2>
                    <div className="cook-mode-v2-ing-expanded muted">
                      {recipe.ingredientSections?.map((sec) => (
                        <div key={sec.name}>
                          <strong className="cook-mode-v2-ing-sec-name">{sec.name}</strong>
                          <ul className="cook-mode-v2-ing-list">
                            {sec.lines.map((line, i) => (
                              <li key={`${line.ingredientId}-${i}`}>
                                {formatIngredientLine(scaleIngredientLine(line, ingredientScale), byId)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}
              {recipeInstructionSteps.length > 0 ? (
                <>
                  <div className="cook-mode-v2-confirm-ing-rule-line" aria-hidden />
                  <section
                    className="cook-mode-v2-confirm-instructions"
                    aria-labelledby={`cook-instructions-heading-confirm-${recipe.id}`}
                  >
                    <h2 className="cook-mode-v2-ing-heading" id={`cook-instructions-heading-confirm-${recipe.id}`}>
                      Instructions
                    </h2>
                    <ol className="cook-mode-v2-confirm-steps-list">
                      {recipeInstructionSteps.map((step, i) => (
                        <li key={i} className="cook-mode-v2-confirm-step">
                          <p className="cook-mode-v2-step-text">{step.text}</p>
                          {step.note ? (
                            <p className="cook-mode-v2-step-note" role="note">
                              <span className="cook-mode-v2-step-note-lead">Note:</span> {step.note}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                </>
              ) : null}
            </div>
            <div className="cook-mode-v2-confirm-footer">
              <div className="cook-mode-v2-confirm-divider" aria-hidden />
                <div className="cook-mode-v2-confirm-actions">
                <button
                  type="button"
                  className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--primary"
                  onClick={() => goStep(1)}
                  {...isolateNestedTouchFromSwipePaneProps}
                >
                  Start cooking
                </button>
                <button
                  type="button"
                  className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--outline"
                  onClick={onItsReady}
                  disabled={celebrationOpen}
                  aria-label="Mark this meal as cooked and return to the menu"
                  {...isolateNestedTouchFromSwipePaneProps}
                >
                  {"It's ready"}
                </button>
              </div>
              <button
                type="button"
                className="cook-mode-v2-confirm-cancel"
                onClick={onCancelCooking}
                {...isolateNestedTouchFromSwipePaneProps}
              >
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
                    {...isolateNestedTouchFromSwipePaneProps}
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
            <section
              className="cook-mode-v2-pane-section cook-mode-v2-pane-section--recipe"
              aria-label="Step instructions"
            >
              <p className="cook-mode-v2-step-text">{stepText}</p>
              {stepNote ? (
                <p className="cook-mode-v2-step-note" role="note">
                  <span className="cook-mode-v2-step-note-lead">Note:</span> {stepNote}
                </p>
              ) : null}
              <div className="cook-mode-v2-step-edit-wrap">
                <button
                  type="button"
                  className="cook-mode-v2-step-edit"
                  onClick={openEditRecipeForCurrentStep}
                  aria-label="Edit or add a note for this step in the recipe editor"
                  {...isolateNestedTouchFromSwipePaneProps}
                >
                  Edit or add note
                </button>
              </div>
            </section>

            {flatIngredientChips.length > 0 ? (
              <section
                className="cook-mode-v2-pane-section cook-mode-v2-pane-section--ingredients cook-mode-v2-ing-block"
                aria-labelledby={`cook-ingredients-heading-${recipe.id}`}
              >
                <h2 className="cook-mode-v2-ing-head-outer">
                  <button
                    type="button"
                    className="cook-mode-v2-ing-head-toggle"
                    id={`cook-ingredients-toggle-${recipe.id}`}
                    onClick={() => setCookIngredientsOpen((v) => !v)}
                    aria-expanded={cookIngredientsOpen}
                    aria-controls={`cook-ingredients-panel-${recipe.id}`}
                    {...isolateNestedTouchFromSwipePaneProps}
                  >
                    <span className="cook-mode-v2-ing-heading" id={`cook-ingredients-heading-${recipe.id}`}>
                      Ingredients
                    </span>
                    <span className="cook-mode-v2-ing-toggle-arrow" aria-hidden>
                      {cookIngredientsOpen ? "▼" : "▶"}
                    </span>
                  </button>
                </h2>
                {cookIngredientsOpen ? (
                  <div
                    id={`cook-ingredients-panel-${recipe.id}`}
                    className="cook-mode-v2-ing-expanded muted"
                    role="region"
                    aria-labelledby={`cook-ingredients-heading-${recipe.id}`}
                  >
                    {servingsStepper}
                    {recipe.ingredientSections?.map((sec) => (
                      <div key={sec.name}>
                        <strong className="cook-mode-v2-ing-sec-name">{sec.name}</strong>
                        <ul className="cook-mode-v2-ing-list">
                          {sec.lines.map((line, i) => (
                            <li key={`${line.ingredientId}-${i}`}>
                              {formatIngredientLine(scaleIngredientLine(line, ingredientScale), byId)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {clock && durationForActive > 0 ? (
              <section className="cook-mode-v2-pane-section cook-mode-v2-pane-section--timer" aria-label="Step timer">
                <div className="cook-mode-v2-timer">
                  <div className="cook-mode-v2-timer-layout">
                    <button
                      type="button"
                      className={`cook-mode-v2-timer-main${clock.phase === "done" ? " cook-mode-v2-timer-main--done" : ""}`}
                      onClick={onTapReadout}
                      aria-label={
                        clock.phase === "running"
                          ? "Pause step timer"
                          : clock.phase === "paused"
                            ? "Resume step timer"
                            : clock.phase === "done"
                              ? "Stop alarm and reset step timer"
                              : "Start step timer"
                      }
                      {...isolateNestedTouchFromSwipePaneProps}
                    >
                      <span className="cook-mode-v2-timer-main-digits-wrap">
                        <span
                          className={`cook-mode-v2-timer-main-digits${displaySeconds >= 3600 ? " cook-mode-v2-timer-main-digits--long" : ""}`}
                        >
                          {formatMSS(displaySeconds)}
                        </span>
                      </span>
                      <span className="cook-mode-v2-timer-main-action">
                        {clock.phase === "running"
                          ? "Pause"
                          : clock.phase === "paused"
                            ? "Resume"
                            : clock.phase === "done"
                              ? "Stop"
                              : "Start"}
                      </span>
                    </button>
                    <div className="cook-mode-v2-timer-adjusts">
                      <button
                        type="button"
                        className="cook-mode-v2-timer-adjust"
                        onClick={onAdd30Sec}
                        aria-label="Add 30 seconds to step timer"
                        {...isolateNestedTouchFromSwipePaneProps}
                      >
                        + 30 sec
                      </button>
                      <button
                        type="button"
                        className="cook-mode-v2-timer-adjust"
                        onClick={onSubtract30Sec}
                        aria-label="Subtract 30 seconds from step timer"
                        {...isolateNestedTouchFromSwipePaneProps}
                      >
                        - 30 sec
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {isLastCookStep ? (
              <div className="cook-mode-v2-last-step-cta">
                <button
                  type="button"
                  className="cook-mode-v2-confirm-btn cook-mode-v2-confirm-btn--primary"
                  onClick={onItsReady}
                  disabled={celebrationOpen}
                  {...isolateNestedTouchFromSwipePaneProps}
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
                  {...isolateNestedTouchFromSwipePaneProps}
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
                          {...isolateNestedTouchFromSwipePaneProps}
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
                  {...isolateNestedTouchFromSwipePaneProps}
                >
                  <span className="cook-mode-v2-nav-arrow" aria-hidden>
                    →
                  </span>
                </button>
              </div>
              <div className="cook-mode-v2-cook-bottom">
                <button
                  type="button"
                  className="cook-mode-v2-confirm-cancel cook-mode-v2-footer-cancel"
                  onClick={onCancelCooking}
                  {...isolateNestedTouchFromSwipePaneProps}
                >
                  Cancel cooking
                </button>
              </div>
            </div>
          </>
        )}
      </article>

      {celebrationOpen ? (
        <div
          className="cook-mode-v2-celebration"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cook-celebration-title"
          aria-describedby="cook-celebration-desc"
        >
          <div className="cook-mode-v2-celebration-backdrop" aria-hidden />
          <div className="cook-mode-v2-celebration-card" aria-live="polite">
            <span className="cook-mode-v2-celebration-emoji" aria-hidden>
              🎉
            </span>
            <h2 id="cook-celebration-title" className="cook-mode-v2-celebration-heading">
              Nice work!
            </h2>
            <p id="cook-celebration-desc" className="cook-mode-v2-celebration-recipe">
              {recipe.title}
            </p>
            <p className="cook-mode-v2-celebration-logged">Marked as cooked</p>
            <button
              type="button"
              className="cook-mode-v2-celebration-cta btn-primary btn-cta-wide"
              onClick={finishCelebrationAndExit}
            >
              Continue
            </button>
            <p className="cook-mode-v2-celebration-hint">Returning to your menu automatically…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
