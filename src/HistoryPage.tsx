import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Recipe } from "./types";
import { iso } from "./mealPlanDates";
import { recipeDetailPath, recipesAddToPlanPath } from "./listTabSearch";
import { useCookHistory } from "./CookHistoryContext";
import type { CookHistoryByDate, CookedMeal } from "./cookHistoryStorage";
import { useMealPlan } from "./MealPlanContext";
import { isMealPlanDateKey, portionCountOf } from "./mealPlanStorage";
import { recipeSegment } from "./recipeCourse";
import type { MealPlanByDate, PlannedMeal } from "./mealPlanStorage";

/**
 * Cook-log rows for a day that are NOT covered by a planned slot for that day.
 *
 * Matching is slot-ref-first: a cook-log entry counts as "covered" only if a plan slot
 * shares its `planSlotRef`. Legacy cook entries with no `planSlotRef` fall back to id-match
 * against any plan id on the day. This prevents extra cook-log rows being hidden when the
 * user has duplicate plan slots of the same recipe (only one cooked).
 */
function loggedRowsNotCoveredByPlan(
  logged: CookedMeal[],
  plannedSlotRefs: Set<string>,
  plannedIdsFallback: Set<string>,
): { meal: CookedMeal; logIndex: number }[] {
  const out: { meal: CookedMeal; logIndex: number }[] = [];
  logged.forEach((meal, logIndex) => {
    if (meal.planSlotRef && plannedSlotRefs.has(meal.planSlotRef)) {
      return;
    }
    if (!meal.planSlotRef && plannedIdsFallback.has(meal.id)) {
      return;
    }
    out.push({ meal, logIndex });
  });
  return out;
}

function plannedSlotRefsOnDay(plan: MealPlanByDate, dayIso: string): Set<string> {
  const refs = new Set<string>();
  for (const m of plan[dayIso] ?? []) {
    if (m.planSlotRef) refs.add(m.planSlotRef);
  }
  return refs;
}

function plannedIdsOnDay(plan: MealPlanByDate, dayIso: string): Set<string> {
  return new Set((plan[dayIso] ?? []).map((m) => m.id));
}

function dayHasPlanOrLog(
  plan: MealPlanByDate,
  history: CookHistoryByDate,
  dayIso: string,
): boolean {
  return (plan[dayIso] ?? []).length > 0 || (history[dayIso] ?? []).length > 0;
}

/**
 * Has this specific plan slot been logged as cooked? Slot-ref-first match with id-match fallback
 * for legacy cook entries (so multiple plan slots of the same recipe are tracked independently).
 */
function planMealHasCookLogLine(meal: PlannedMeal, logged: CookedMeal[]): boolean {
  if (meal.planSlotRef) {
    if (logged.some((l) => l.planSlotRef === meal.planSlotRef)) return true;
  }
  // Legacy fallback: a no-slot-ref cook entry of the same recipe covers a single plan slot
  // (best effort — the legacy schema can't distinguish duplicates).
  return logged.some((l) => l.planSlotRef == null && l.id === meal.id);
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Compare local calendar dates as YYYY-MM-DD. */
function dayRelativeToToday(dayIso: string, todayIso: string): "past" | "today" | "future" {
  if (dayIso < todayIso) {
    return "past";
  }
  if (dayIso > todayIso) {
    return "future";
  }
  return "today";
}

/** Leading blank cells before day 1 for a Sunday-first calendar (Sun=0 → no offset). */
function sundayPaddingFirstOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay();
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toIsoLocal(year: number, monthIndex: number, day: number): string {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function monthDateKeys(year: number, monthIndex: number): string[] {
  const mi = monthIndex;
  const dim = daysInMonth(year, mi);
  const keys: string[] = [];
  for (let day = 1; day <= dim; day++) {
    keys.push(toIsoLocal(year, mi, day));
  }
  return keys;
}

/**
 * Is this logged meal a side? Prefers the live recipe (tags can change after the cook was
 * logged) and falls back to the `kind` captured on the log entry itself for recipes that
 * have since been deleted.
 */
function loggedMealIsSide(meal: CookedMeal, recipeById: Map<string, Recipe>): boolean {
  const r = recipeById.get(meal.id);
  if (r) {
    return recipeSegment(r) === "side";
  }
  return meal.kind === "side";
}

function computeMonthStats(
  history: CookHistoryByDate,
  year: number,
  monthIndex: number,
  recipeById: Map<string, Recipe>,
) {
  const keys = monthDateKeys(year, monthIndex);
  let daysWithCooks = 0;
  let totalServings = 0;
  for (const k of keys) {
    const arr = history[k] ?? [];
    if (arr.length > 0) {
      daysWithCooks += 1;
    }
    for (const m of arr) {
      // Sides ride along with a main — counting their servings would double-count the meal and
      // inflate the savings estimate, so only mains contribute to the totals.
      if (loggedMealIsSide(m, recipeById)) {
        continue;
      }
      // Legacy entries (logged before servings were captured) count as 1.
      totalServings += typeof m.servings === "number" && m.servings > 0 ? m.servings : 1;
    }
  }
  const dim = keys.length;
  // Rough "money saved vs. eating out" — assume each serving cooked saves a flat amount.
  const DOLLARS_SAVED_PER_SERVING = 10;

  return {
    daysWithCooks,
    dim,
    totalServings,
    secondLabel: "Total servings" as const,
    secondValue: totalServings,
    secondSub: "this month" as const,
    moneySaved: totalServings * DOLLARS_SAVED_PER_SERVING,
  };
}

export function HistoryPage({ recipes }: { recipes: Recipe[] }) {
  const navigate = useNavigate();
  const { history, logCooked, logRecipeCooked, removeCookedAt, setCookedServingsAt } =
    useCookHistory();
  const { plan, removeMealAt, adjustCalendarPortionCount } = useMealPlan();
  const todayIso = iso(new Date());

  // Optional `?day=YYYY-MM-DD` deep link (e.g. returning here after planning a meal) — preselect
  // that day and open its month.
  const [searchParams] = useSearchParams();
  const initialDay = (() => {
    const d = searchParams.get("day");
    return d && isMealPlanDateKey(d) ? d : null;
  })();

  const [viewMonth, setViewMonth] = React.useState(() => {
    const d = initialDay ? new Date(`${initialDay}T12:00:00`) : new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const [selectedIso, setSelectedIso] = React.useState<string | null>(initialDay);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [pickQ, setPickQ] = React.useState("");
  /** Date the log-a-meal sheet will write to; editable inside the sheet. */
  const [pickDate, setPickDate] = React.useState<string>(() => iso(new Date()));

  const selectedRel =
    selectedIso != null ? dayRelativeToToday(selectedIso, todayIso) : null;
  const selectedIsFuture = selectedRel === "future";

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const dim = daysInMonth(y, m);
  const pad = sundayPaddingFirstOfMonth(y, m);

  const monthKeys = React.useMemo(() => monthDateKeys(y, m), [y, m]);

  React.useEffect(() => {
    if (selectedIso && !monthKeys.includes(selectedIso)) {
      setSelectedIso(null);
    }
  }, [monthKeys, selectedIso]);

  const recipeById = React.useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );

  const stats = React.useMemo(
    () => computeMonthStats(history, y, m, recipeById),
    [history, y, m, recipeById],
  );

  /**
   * Everything cooked in the visible month, newest first — what fills the space below the
   * calendar when the user hasn't picked a specific day.
   */
  const monthActivity = React.useMemo(() => {
    const days: Array<{ dayIso: string; meals: CookedMeal[] }> = [];
    for (const k of monthKeys) {
      const meals = history[k] ?? [];
      if (meals.length > 0) {
        days.push({ dayIso: k, meals });
      }
    }
    days.sort((a, b) => b.dayIso.localeCompare(a.dayIso));
    return days;
  }, [history, monthKeys]);

  const calendarCells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < pad; i++) {
    calendarCells.push({ day: null, iso: null });
  }
  for (let day = 1; day <= dim; day++) {
    calendarCells.push({ day, iso: toIsoLocal(y, m, day) });
  }
  while (calendarCells.length % 7 !== 0) {
    calendarCells.push({ day: null, iso: null });
  }

  const filteredRecipes = React.useMemo(() => {
    const q = pickQ.trim().toLowerCase();
    if (!q) {
      return recipes;
    }
    return recipes.filter((r) => r.title.toLowerCase().includes(q));
  }, [recipes, pickQ]);

  const monthTitle = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const markPlannedMealAsCooked = React.useCallback(
    (dayIso: string, meal: PlannedMeal, _planIndex: number) => {
      if (dayRelativeToToday(dayIso, todayIso) === "future") {
        return;
      }
      const logged = history[dayIso] ?? [];
      if (planMealHasCookLogLine(meal, logged)) {
        return;
      }
      logCooked(dayIso, {
        id: meal.id,
        title: meal.title,
        kind: meal.kind,
        ...(meal.planSlotRef ? { planSlotRef: meal.planSlotRef } : {}),
        servings: portionCountOf(meal),
      });
    },
    [history, logCooked, todayIso],
  );

  const removePlannedMealFromDay = React.useCallback(
    (dayIso: string, planIndex: number, meal: PlannedMeal) => {
      const logged = history[dayIso] ?? [];
      // Prefer slot-ref match (no false positive when duplicate recipes exist that day);
      // fall back to id-match for legacy cook entries that predate planSlotRef.
      let logIdx = -1;
      if (meal.planSlotRef) {
        logIdx = logged.findIndex((l) => l.planSlotRef === meal.planSlotRef);
      }
      if (logIdx < 0) {
        logIdx = logged.findIndex((l) => l.planSlotRef == null && l.id === meal.id);
      }
      removeMealAt(dayIso, planIndex);
      if (logIdx >= 0) {
        removeCookedAt(dayIso, logIdx);
      }
    },
    [history, removeMealAt, removeCookedAt],
  );

  /** Adjust servings for a planned slot; if it's already logged cooked, keep the log entry in sync. */
  const adjustPlannedRowServings = React.useCallback(
    (dayIso: string, planIndex: number, meal: PlannedMeal, delta: number) => {
      adjustCalendarPortionCount(dayIso, planIndex, delta);
      const logged = history[dayIso] ?? [];
      let logIdx = -1;
      if (meal.planSlotRef) {
        logIdx = logged.findIndex((l) => l.planSlotRef === meal.planSlotRef);
      }
      if (logIdx < 0) {
        logIdx = logged.findIndex((l) => l.planSlotRef == null && l.id === meal.id);
      }
      if (logIdx >= 0) {
        const next = Math.min(99, Math.max(1, portionCountOf(meal) + delta));
        setCookedServingsAt(dayIso, logIdx, next);
      }
    },
    [adjustCalendarPortionCount, history, setCookedServingsAt],
  );

  /** Adjust servings on a cook-log-only row (no plan slot). */
  const adjustLoggedRowServings = React.useCallback(
    (dayIso: string, logIndex: number, meal: CookedMeal, delta: number) => {
      const cur = meal.servings && meal.servings > 0 ? meal.servings : 1;
      setCookedServingsAt(dayIso, logIndex, cur + delta);
    },
    [setCookedServingsAt],
  );

  /**
   * Open the log-a-meal sheet. Works with or without a day selected — the sheet carries its own
   * date field, defaulting to the selected day, or today when logging from the month view.
   * Takes no arguments so it can be passed straight to onClick without the event leaking in.
   */
  const openPicker = () => {
    const target = selectedIso ?? todayIso;
    // You can't have cooked something in the future; clamp defensively.
    setPickDate(target > todayIso ? todayIso : target);
    setPickQ("");
    setPickOpen(true);
  };

  const closePicker = () => {
    setPickOpen(false);
  };

  return (
    <div className="history-page">
      <header className="history-head" />


      <section className="history-calendar-section" aria-label="Calendar">
        <div className="history-month-nav">
          <button
            type="button"
            className="history-month-btn"
            aria-label="Previous month"
            onClick={() =>
              setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1, 12, 0, 0, 0))
            }
          >
            ‹
          </button>
          <span className="history-month-label">{monthTitle}</span>
          <button
            type="button"
            className="history-month-btn"
            aria-label="Next month"
            onClick={() =>
              setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1, 12, 0, 0, 0))
            }
          >
            ›
          </button>
        </div>

        <div className="history-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="history-weekday">
              {label}
            </div>
          ))}
        </div>

        <div id="history-calendar-panel">
          <div
            className="history-calendar-grid"
            role="grid"
            aria-label={`${monthTitle} — calendar`}
          >
              {calendarCells.map((cell, idx) => {
                if (cell.iso === null || cell.day === null) {
                  return (
                    <div key={`e-${idx}`} className="history-cal-cell history-cal-cell--empty" />
                  );
                }
                const nLogged = history[cell.iso]?.length ?? 0;
                const nPlanned = plan[cell.iso]?.length ?? 0;
                const hasMark = dayHasPlanOrLog(plan, history, cell.iso);
                const hasLogged = nLogged > 0;
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedIso;
                const rel = dayRelativeToToday(cell.iso, todayIso);
                const emptyCalAria =
                  rel === "future" ? `${cell.day}, nothing planned yet` : `${cell.day}, nothing logged`;
                const markAria =
                  nPlanned > 0 && nLogged > 0
                    ? `${cell.day}, ${nPlanned} on menu, ${nLogged} logged`
                    : nPlanned > 0
                      ? `${cell.day}, ${nPlanned} meal(s) on menu${
                          nLogged === 0 ? ", not logged yet" : ""
                        }`
                      : `${cell.day}, ${nLogged} meal(s) logged`;
                const markToneClass =
                  hasMark && hasLogged
                    ? " history-cal-cell--cooked"
                    : hasMark
                      ? " history-cal-cell--planned"
                      : "";
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    className={`history-cal-cell${markToneClass}${
                      isToday ? " history-cal-cell--today" : ""
                    }${isSelected ? " history-cal-cell--selected" : ""}`}
                    onClick={() => setSelectedIso((prev) => (prev === cell.iso ? null : cell.iso))}
                    aria-pressed={isSelected}
                    aria-label={hasMark ? markAria : emptyCalAria}
                  >
                    <span className="history-cal-daynum">{cell.day}</span>
                    {hasMark ? <span className="history-cal-dot" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
        </div>
      </section>

      <section
        className="history-summary"
        aria-label="Month summary"
      >
        <div className="history-summary-card">
          <div className="history-summary-value">{stats.daysWithCooks}</div>
          <div className="history-summary-label">Days cooked</div>
          <div className="history-summary-sub">out of {stats.dim}</div>
        </div>
        <div className="history-summary-card">
          <div className="history-summary-value">{stats.secondValue}</div>
          <div className="history-summary-label">{stats.secondLabel}</div>
          <div className="history-summary-sub">{stats.secondSub}</div>
        </div>
        <div className="history-summary-card">
          <div className="history-summary-value">${stats.moneySaved}</div>
          <div className="history-summary-label">Estimated savings</div>
          <div className="history-summary-sub">~$10/serving</div>
        </div>
      </section>

      {selectedIso ? (
        dayHasPlanOrLog(plan, history, selectedIso) ? (
          <section className="history-day-detail" aria-labelledby="history-day-heading">
            <div className="history-day-detail-head">
              <h2 id="history-day-heading" className="history-day-heading">
                {new Date(`${selectedIso}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h2>
              <button
                type="button"
                className="btn-secondary btn-compact"
                onClick={
                  selectedIsFuture
                    ? () => navigate(recipesAddToPlanPath(selectedIso))
                    : openPicker
                }
              >
                {selectedIsFuture ? "+ Plan meal" : "+ Log meal"}
              </button>
            </div>
            <ul className="history-day-meals">
              {(plan[selectedIso] ?? []).map((meal, planIndex) => {
                const loggedForDay = history[selectedIso] ?? [];
                const hasCookLog = planMealHasCookLogLine(meal, loggedForDay);
                const showMarkCooked = !hasCookLog && !selectedIsFuture;
                return (
                  <li
                    key={`${selectedIso}-plan-${planIndex}-${meal.id}`}
                    className={`history-day-meal-row${
                      hasCookLog ? "" : " history-day-meal-row--planned"
                    }`}
                  >
                    <span className="history-day-meal-title">{meal.title}</span>
                    <div className="history-day-meal-servings">
                      <button
                        type="button"
                        className="meal-chip-portion-btn"
                        aria-label={`Decrease servings for ${meal.title}`}
                        onClick={() => adjustPlannedRowServings(selectedIso, planIndex, meal, -1)}
                      >
                        −
                      </button>
                      <span
                        className="meal-chip-portion-value"
                        aria-label={`Servings: ${portionCountOf(meal)}`}
                      >
                        {portionCountOf(meal)}
                      </span>
                      <button
                        type="button"
                        className="meal-chip-portion-btn"
                        aria-label={`Increase servings for ${meal.title}`}
                        onClick={() => adjustPlannedRowServings(selectedIso, planIndex, meal, 1)}
                      >
                        +
                      </button>
                    </div>
                    <Link
                      to={recipeDetailPath(meal.id, undefined, false, true, false)}
                      className="history-day-meal-view"
                      aria-label={`View ${meal.title}`}
                    >
                      View
                    </Link>
                    {showMarkCooked ? (
                      <button
                        type="button"
                        className="history-day-meal-log-cooked"
                        aria-label={`Log ${meal.title} as cooked`}
                        onClick={() => markPlannedMealAsCooked(selectedIso, meal, planIndex)}
                      >
                        Log cooked
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="history-day-meal-remove"
                      aria-label={`Remove ${meal.title} from meal plan`}
                      onClick={() => removePlannedMealFromDay(selectedIso, planIndex, meal)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
              {loggedRowsNotCoveredByPlan(
                history[selectedIso] ?? [],
                plannedSlotRefsOnDay(plan, selectedIso),
                plannedIdsOnDay(plan, selectedIso),
              ).map(({ meal, logIndex }) => (
                <li key={`${selectedIso}-log-${logIndex}-${meal.id}`} className="history-day-meal-row">
                  <span className="history-day-meal-title">{meal.title}</span>
                  <div className="history-day-meal-servings">
                    <button
                      type="button"
                      className="meal-chip-portion-btn"
                      aria-label={`Decrease servings for ${meal.title}`}
                      onClick={() => adjustLoggedRowServings(selectedIso, logIndex, meal, -1)}
                    >
                      −
                    </button>
                    <span
                      className="meal-chip-portion-value"
                      aria-label={`Servings: ${meal.servings && meal.servings > 0 ? meal.servings : 1}`}
                    >
                      {meal.servings && meal.servings > 0 ? meal.servings : 1}
                    </span>
                    <button
                      type="button"
                      className="meal-chip-portion-btn"
                      aria-label={`Increase servings for ${meal.title}`}
                      onClick={() => adjustLoggedRowServings(selectedIso, logIndex, meal, 1)}
                    >
                      +
                    </button>
                  </div>
                  <Link
                    to={recipeDetailPath(meal.id, undefined, false, true, false)}
                    className="history-day-meal-view"
                    aria-label={`View ${meal.title}`}
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    className="history-day-meal-remove"
                    aria-label={`Remove ${meal.title} from cook log`}
                    onClick={() => removeCookedAt(selectedIso, logIndex)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="history-day-detail history-day-detail--empty">
            <h2 className="history-day-heading">
              {new Date(`${selectedIso}T12:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h2>
            <p className="muted">
              {selectedIsFuture ? "Nothing on the menu for this day yet." : "Nothing logged for this day."}
            </p>
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={
                selectedIsFuture
                  ? () => navigate(recipesAddToPlanPath(selectedIso))
                  : openPicker
              }
            >
              {selectedIsFuture ? "+ Plan meal" : "+ Log meal"}
            </button>
          </section>
        )
      ) : monthActivity.length > 0 ? (
        <section className="history-month-activity" aria-labelledby="history-month-activity-heading">
          <div className="history-day-detail-head">
            <h2 id="history-month-activity-heading" className="history-day-heading">
              Cooked this month
            </h2>
            <button type="button" className="btn-secondary btn-compact" onClick={openPicker}>
              + Log meal
            </button>
          </div>
          <ul className="history-month-activity-list">
            {monthActivity.map(({ dayIso, meals }) => (
              <li key={dayIso} className="history-month-activity-day">
                <button
                  type="button"
                  className="history-month-activity-date"
                  onClick={() => setSelectedIso(dayIso)}
                >
                  {new Date(`${dayIso}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </button>
                <ul className="history-month-activity-meals">
                  {meals.map((meal, i) => (
                    <li key={`${dayIso}-${i}-${meal.id}`} className="history-month-activity-meal">
                      <Link
                        to={recipeDetailPath(meal.id, undefined, false, true, false)}
                        className="history-month-activity-meal-title"
                      >
                        {meal.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="history-month-activity history-month-activity--empty">
          <p className="muted">Nothing cooked in {monthTitle} yet.</p>
          <button type="button" className="btn-secondary btn-compact" onClick={openPicker}>
            + Log meal
          </button>
        </section>
      )}

      <div
        className={`planner-overlay${pickOpen ? " open" : ""}`}
        aria-hidden={!pickOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closePicker();
          }
        }}
      >
        <div className="planner-sheet planner-sheet--fixed-tall" role="dialog" aria-labelledby="historyPickTitle" aria-modal="true">
          <div className="planner-sheet-head">
            <h2 id="historyPickTitle">Log a meal</h2>
            <div className="history-log-date-row">
              <label className="history-log-date-label" htmlFor="history-log-date">
                Cooked on
              </label>
              <input
                id="history-log-date"
                className="history-log-date-input"
                type="date"
                value={pickDate}
                max={todayIso}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isMealPlanDateKey(v) && v <= todayIso) {
                    setPickDate(v);
                  }
                }}
              />
            </div>
          </div>
          <div className="planner-sheet-search">
            <input
              className="search"
              type="search"
              placeholder="Filter recipes…"
              value={pickQ}
              onChange={(e) => setPickQ(e.target.value)}
            />
          </div>
          <div className="planner-sheet-body" style={{ paddingTop: 0 }}>
            {filteredRecipes.map((r) => (
              <button
                key={r.id}
                type="button"
                className="pick-row"
                onClick={() => {
                  logRecipeCooked(pickDate, r);
                  // Jump the calendar to the logged month so the entry is actually visible —
                  // otherwise logging to another month looks like nothing happened.
                  const d = new Date(`${pickDate}T12:00:00`);
                  setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, 0));
                  closePicker();
                }}
              >
                <span>{r.title}</span>
              </button>
            ))}
          </div>
          <div className="planner-sheet-foot">
            <button type="button" className="btn-secondary" onClick={closePicker}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
