/**
 * Session persistence for the new cook mode: active step, completion, per-step countdown clocks.
 */

/** v2: indices include leading “confirm ingredients” step. */
const UI_PREFIX = "recipe-app-cook-ui-v2:";
const CLOCK_PREFIX = "recipe-app-cook-step-clock-v2:";
const LEGACY_TIMER_PREFIX = "recipe-app-cook-timer-v1:";
const UI_PREFIX_LEGACY = "recipe-app-cook-ui-v1:";
const CLOCK_PREFIX_LEGACY = "recipe-app-cook-step-clock-v1:";
/** Wall-clock ms when user first advanced past step 0 (confirm ingredients). */
const TOTAL_ELAPSED_PREFIX = "recipe-app-cook-total-elapsed-v2:";

export type CookUiPersist = {
  activeStepIndex: number;
  /** Step indices marked done (for progress / optional future use). */
  completedStepIndices: number[];
};

export type StepClockPhase = "idle" | "running" | "paused" | "done";

/** Per-step countdown (only used when the step has durationSeconds in the recipe). */
export type StepClockPersist = {
  phase: StepClockPhase;
  /** Total seconds to count from (recipe duration + user +1 min adjustments while idle). */
  totalSeconds: number;
  /** Wall-clock ms when running countdown hits zero (inclusive). */
  runEndsAt: number | null;
  /** Frozen remaining when paused (whole seconds). */
  remainingSeconds: number | null;
};

function uiKey(recipeId: string, cookDate: string, cookSlotRef: string | null): string {
  return `${UI_PREFIX}${recipeId}\x1e${cookDate}\x1e${cookSlotRef ?? ""}`;
}

function clockKey(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  stepIndex: number,
): string {
  return `${CLOCK_PREFIX}${recipeId}\x1e${cookDate}\x1e${cookSlotRef ?? ""}\x1e${stepIndex}`;
}

function totalElapsedKey(recipeId: string, cookDate: string, cookSlotRef: string | null): string {
  return `${TOTAL_ELAPSED_PREFIX}${recipeId}\x1e${cookDate}\x1e${cookSlotRef ?? ""}`;
}

/** Session wall clock for “Total time” in cook mode: start anchor + pause bookkeeping. */
export type CookSessionTotalPersist = {
  startedAt: number;
  /** Sum of completed pause intervals (ms). */
  totalPausedMs: number;
  /** Wall ms when current pause began, or null if running. */
  pauseBeganAt: number | null;
};

export function loadCookSessionTotalPersist(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
): CookSessionTotalPersist | null {
  try {
    const s = sessionStorage.getItem(totalElapsedKey(recipeId, cookDate, cookSlotRef));
    if (!s) {
      return null;
    }
    const o = JSON.parse(s) as unknown;
    if (o == null || typeof o !== "object") {
      return null;
    }
    const rec = o as Record<string, unknown>;
    const startedAt = rec.startedAt;
    if (typeof startedAt !== "number" || !Number.isFinite(startedAt)) {
      return null;
    }
    let totalPausedMs = 0;
    const tpm = rec.totalPausedMs;
    if (typeof tpm === "number" && Number.isFinite(tpm) && tpm >= 0) {
      totalPausedMs = tpm;
    }
    let pauseBeganAt: number | null = null;
    const pb = rec.pauseBeganAt;
    if (typeof pb === "number" && Number.isFinite(pb)) {
      pauseBeganAt = pb;
    }
    return { startedAt, totalPausedMs, pauseBeganAt };
  } catch {
    return null;
  }
}

export function saveCookSessionTotalPersist(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  model: CookSessionTotalPersist,
): void {
  try {
    sessionStorage.setItem(totalElapsedKey(recipeId, cookDate, cookSlotRef), JSON.stringify(model));
  } catch {
    /* ignore */
  }
}

/** First time past confirm step: create row only if missing. */
export function ensureCookSessionTotalStarted(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  startedAtMs: number,
): CookSessionTotalPersist {
  const existing = loadCookSessionTotalPersist(recipeId, cookDate, cookSlotRef);
  if (existing != null) {
    return existing;
  }
  const initial: CookSessionTotalPersist = {
    startedAt: startedAtMs,
    totalPausedMs: 0,
    pauseBeganAt: null,
  };
  saveCookSessionTotalPersist(recipeId, cookDate, cookSlotRef, initial);
  return initial;
}

/** Active elapsed ms for the session total (excludes paused intervals). */
export function sessionTotalElapsedMs(model: CookSessionTotalPersist | null, now: number): number {
  if (model == null) {
    return 0;
  }
  const end = model.pauseBeganAt ?? now;
  return Math.max(0, end - model.startedAt - model.totalPausedMs);
}

function parseUi(raw: unknown): CookUiPersist | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const activeStepIndex = o.activeStepIndex;
  const completed = o.completedStepIndices;
  if (typeof activeStepIndex !== "number" || !Number.isFinite(activeStepIndex) || activeStepIndex < 0) {
    return null;
  }
  if (!Array.isArray(completed)) {
    return null;
  }
  const completedStepIndices: number[] = [];
  for (const x of completed) {
    if (typeof x === "number" && Number.isFinite(x) && x >= 0) {
      completedStepIndices.push(Math.floor(x));
    }
  }
  return { activeStepIndex: Math.floor(activeStepIndex), completedStepIndices };
}

function parseClock(raw: unknown): StepClockPersist | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const phase = o.phase;
  if (phase !== "idle" && phase !== "running" && phase !== "paused" && phase !== "done") {
    return null;
  }
  const totalSeconds = o.totalSeconds;
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }
  const runEndsAt = o.runEndsAt;
  if (runEndsAt != null && (typeof runEndsAt !== "number" || !Number.isFinite(runEndsAt))) {
    return null;
  }
  const remainingSeconds = o.remainingSeconds;
  if (
    remainingSeconds != null &&
    (typeof remainingSeconds !== "number" || !Number.isFinite(remainingSeconds))
  ) {
    return null;
  }
  return {
    phase,
    totalSeconds: Math.max(0, Math.floor(totalSeconds)),
    runEndsAt: runEndsAt == null ? null : runEndsAt,
    remainingSeconds: remainingSeconds == null ? null : Math.max(0, Math.floor(remainingSeconds)),
  };
}

export function loadCookUi(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
): CookUiPersist | null {
  try {
    const s = sessionStorage.getItem(uiKey(recipeId, cookDate, cookSlotRef));
    if (!s) {
      return null;
    }
    return parseUi(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function saveCookUi(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  model: CookUiPersist,
): void {
  try {
    sessionStorage.setItem(uiKey(recipeId, cookDate, cookSlotRef), JSON.stringify(model));
  } catch {
    /* ignore */
  }
}

/**
 * If no clock was ever saved for this step, returns null (unlike `loadStepClock`, which returns idle defaults).
 * Used to inspect other cook sessions (e.g. “Also running” dock) without recipe defaults.
 */
export function readStepClockPersistIfAny(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  stepIndex: number,
): StepClockPersist | null {
  try {
    const s = sessionStorage.getItem(clockKey(recipeId, cookDate, cookSlotRef, stepIndex));
    if (!s) {
      return null;
    }
    return parseClock(JSON.parse(s) as unknown);
  } catch {
    return null;
  }
}

export function loadStepClock(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  stepIndex: number,
  defaultTotalSeconds: number,
): StepClockPersist {
  try {
    const s = sessionStorage.getItem(clockKey(recipeId, cookDate, cookSlotRef, stepIndex));
    if (!s) {
      return {
        phase: "idle",
        totalSeconds: defaultTotalSeconds,
        runEndsAt: null,
        remainingSeconds: null,
      };
    }
    const parsed = parseClock(JSON.parse(s) as unknown);
    if (!parsed) {
      return {
        phase: "idle",
        totalSeconds: defaultTotalSeconds,
        runEndsAt: null,
        remainingSeconds: null,
      };
    }
    if (parsed.totalSeconds <= 0 && defaultTotalSeconds > 0) {
      return {
        ...parsed,
        totalSeconds: defaultTotalSeconds,
      };
    }
    return parsed;
  } catch {
    return {
      phase: "idle",
      totalSeconds: defaultTotalSeconds,
      runEndsAt: null,
      remainingSeconds: null,
    };
  }
}

export function saveStepClock(
  recipeId: string,
  cookDate: string,
  cookSlotRef: string | null,
  stepIndex: number,
  model: StepClockPersist,
): void {
  try {
    sessionStorage.setItem(
      clockKey(recipeId, cookDate, cookSlotRef, stepIndex),
      JSON.stringify(model),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Remove cook UI, per-step clocks, and legacy count-up timer keys for this recipe + date
 * (all plan slot refs), matching previous cook-mode cleanup behavior.
 */
function matchesCookStorageKey(k: string, needle: string): boolean {
  const prefixes = [
    UI_PREFIX,
    UI_PREFIX_LEGACY,
    CLOCK_PREFIX,
    CLOCK_PREFIX_LEGACY,
    TOTAL_ELAPSED_PREFIX,
  ];
  for (const p of prefixes) {
    if (k.startsWith(p) && k.slice(p.length).startsWith(needle)) {
      return true;
    }
  }
  return false;
}

export function clearCookModeForRecipeDate(recipeId: string, cookDate: string): void {
  const keys: string[] = [];
  const legacyPrefix = `${LEGACY_TIMER_PREFIX}${recipeId}\x1e${cookDate}\x1e`;
  const needle = `${recipeId}\x1e${cookDate}\x1e`;
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) {
        continue;
      }
      if (k.startsWith(legacyPrefix)) {
        keys.push(k);
        continue;
      }
      if (matchesCookStorageKey(k, needle)) {
        keys.push(k);
      }
    }
  } catch {
    return;
  }
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

export function displaySecondsForClock(model: StepClockPersist, now: number): number {
  if (model.phase === "running" && model.runEndsAt != null) {
    return Math.max(0, Math.ceil((model.runEndsAt - now) / 1000));
  }
  if (model.phase === "paused" && model.remainingSeconds != null) {
    return model.remainingSeconds;
  }
  if (model.phase === "done") {
    return 0;
  }
  return model.totalSeconds;
}
