import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Recipe } from "./types";
import {
  addDays,
  buildWeekKeys,
  iso,
  startOfWeekMonday,
  weekRangeLabel,
} from "./mealPlanDates";
import { recipeDetailPath, recipesAddToPlanPath } from "./listTabSearch";
import { useCookHistory } from "./CookHistoryContext";
import type { CookHistoryByDate, CookedMeal } from "./cookHistoryStorage";
import { useMealPlan } from "./MealPlanContext";
import type { MealPlanByDate, PlannedMeal } from "./mealPlanStorage";

/** Cook-log rows that are not already represented by the same plan slot on the calendar. */
function loggedRowsNotCoveredByPlan(
  logged: CookedMeal[],
  planSlotRefs: Set<string>,
): { meal: CookedMeal; logIndex: number }[] {
  const out: { meal: CookedMeal; logIndex: number }[] = [];
  logged.forEach((meal, logIndex) => {
    if (meal.planSlotRef && planSlotRefs.has(meal.planSlotRef)) {
      return;
    }
    out.push({ meal, logIndex });
  });
  return out;
}

function planSlotRefsOnDay(plan: MealPlanByDate, dayIso: string): Set<string> {
  const planned = plan[dayIso] ?? [];
  return new Set(planned.map((m) => m.planSlotRef).filter((r): r is string => Boolean(r)));
}

function dayHasPlanOrLog(
  plan: MealPlanByDate,
  history: CookHistoryByDate,
  dayIso: string,
): boolean {
  const planned = plan[dayIso] ?? [];
  const logged = history[dayIso] ?? [];
  if (planned.length > 0) {
    return true;
  }
  const refs = planSlotRefsOnDay(plan, dayIso);
  return loggedRowsNotCoveredByPlan(logged, refs).length > 0;
}

/** Plan slot has a cook-log entry with the same ref → show mint “cooked” styling, not beige “planned only”. */
function planMealHasCookLogLine(meal: { planSlotRef?: string }, logged: CookedMeal[]): boolean {
  const ref = meal.planSlotRef;
  if (!ref) {
    return false;
  }
  return logged.some((l) => l.planSlotRef === ref);
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

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

function mondayPaddingFirstOfMonth(year: number, monthIndex: number): number {
  const dow = new Date(year, monthIndex, 1).getDay();
  return (dow + 6) % 7;
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

function computeMonthStats(history: CookHistoryByDate, year: number, monthIndex: number) {
  const keys = monthDateKeys(year, monthIndex);
  let daysWithCooks = 0;
  let totalMeals = 0;
  const idCounts = new Map<string, { title: string; count: number }>();
  for (const k of keys) {
    const arr = history[k] ?? [];
    if (arr.length > 0) {
      daysWithCooks += 1;
    }
    for (const m of arr) {
      totalMeals += 1;
      const prev = idCounts.get(m.id);
      if (prev) {
        prev.count += 1;
      } else {
        idCounts.set(m.id, { title: m.title, count: 1 });
      }
    }
  }
  let most: { title: string; count: number } | null = null;
  for (const v of idCounts.values()) {
    if (!most || v.count > most.count) {
      most = { title: v.title, count: v.count };
    }
  }
  const dim = keys.length;

  return {
    daysWithCooks,
    dim,
    totalMeals,
    most,
    secondLabel: "Total servings" as const,
    secondValue: totalMeals,
    secondSub: "this month" as const,
  };
}

function computeWeekStats(history: CookHistoryByDate, weekKeys: string[]) {
  let daysWithCooks = 0;
  let totalMeals = 0;
  const idCounts = new Map<string, { title: string; count: number }>();
  for (const k of weekKeys) {
    const arr = history[k] ?? [];
    if (arr.length > 0) {
      daysWithCooks += 1;
    }
    for (const m of arr) {
      totalMeals += 1;
      const prev = idCounts.get(m.id);
      if (prev) {
        prev.count += 1;
      } else {
        idCounts.set(m.id, { title: m.title, count: 1 });
      }
    }
  }
  let most: { title: string; count: number } | null = null;
  for (const v of idCounts.values()) {
    if (!most || v.count > most.count) {
      most = { title: v.title, count: v.count };
    }
  }

  return {
    daysWithCooks,
    dim: 7,
    totalMeals,
    most,
    secondLabel: "Total servings" as const,
    secondValue: totalMeals,
    secondSub: "this week" as const,
  };
}

type CalendarGranularity = "month" | "week";

export function HistoryPage({ recipes }: { recipes: Recipe[] }) {
  const navigate = useNavigate();
  const { history, logCooked, logRecipeCooked, removeCookedAt } = useCookHistory();
  const { plan, removeMealAt, ensureCalendarSlotRef } = useMealPlan();
  const todayIso = iso(new Date());

  const [granularity, setGranularity] = React.useState<CalendarGranularity>("month");

  const [viewMonth, setViewMonth] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    return d;
  });

  const [weekStart, setWeekStart] = React.useState(() => {
    const ws = startOfWeekMonday(new Date());
    ws.setHours(12, 0, 0, 0);
    return ws;
  });

  const [selectedIso, setSelectedIso] = React.useState<string | null>(null);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [pickQ, setPickQ] = React.useState("");

  const selectedRel =
    selectedIso != null ? dayRelativeToToday(selectedIso, todayIso) : null;
  const selectedIsFuture = selectedRel === "future";

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const dim = daysInMonth(y, m);
  const pad = mondayPaddingFirstOfMonth(y, m);

  const monthKeys = React.useMemo(() => monthDateKeys(y, m), [y, m]);
  const weekKeys = React.useMemo(() => buildWeekKeys(weekStart), [weekStart]);

  React.useEffect(() => {
    if (granularity !== "month") {
      return;
    }
    if (selectedIso && !monthKeys.includes(selectedIso)) {
      setSelectedIso(null);
    }
  }, [granularity, monthKeys, selectedIso]);

  React.useEffect(() => {
    if (granularity !== "week") {
      return;
    }
    if (selectedIso && !weekKeys.includes(selectedIso)) {
      setSelectedIso(null);
    }
  }, [granularity, weekKeys, selectedIso]);

  const stats = React.useMemo(() => {
    if (granularity === "month") {
      return computeMonthStats(history, y, m);
    }
    return computeWeekStats(history, weekKeys);
  }, [granularity, history, y, m, weekKeys]);

  const selectMonthView = () => {
    setGranularity("month");
    const anchor =
      selectedIso != null ? new Date(`${selectedIso}T12:00:00`) : weekStart;
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12, 0, 0, 0));
  };

  const selectWeekView = () => {
    setGranularity("week");
    const now = new Date();
    const viewingCurrentMonth =
      viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();
    const anchor =
      selectedIso != null
        ? new Date(`${selectedIso}T12:00:00`)
        : viewingCurrentMonth
          ? now
          : viewMonth;
    const ws = startOfWeekMonday(anchor);
    ws.setHours(12, 0, 0, 0);
    setWeekStart(ws);
  };

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
  const weekTitle = weekRangeLabel(weekStart);

  const markPlannedMealAsCooked = React.useCallback(
    (dayIso: string, meal: PlannedMeal, planIndex: number) => {
      if (dayRelativeToToday(dayIso, todayIso) === "future") {
        return;
      }
      const ref = ensureCalendarSlotRef(dayIso, planIndex);
      if (!ref) {
        return;
      }
      const logged = history[dayIso] ?? [];
      if (planMealHasCookLogLine({ planSlotRef: ref }, logged)) {
        return;
      }
      logCooked(dayIso, { id: meal.id, title: meal.title, kind: meal.kind, planSlotRef: ref });
    },
    [ensureCalendarSlotRef, history, logCooked, todayIso],
  );

  /** One × removes plan slot and any cook-log row tied by {@link PlannedMeal.planSlotRef} (otherwise log reappears as a second row). */
  const removePlannedMealFromDay = React.useCallback(
    (dayIso: string, planIndex: number, meal: PlannedMeal) => {
      const logged = history[dayIso] ?? [];
      const ref = meal.planSlotRef;
      const logIdx = ref ? logged.findIndex((l) => l.planSlotRef === ref) : -1;
      removeMealAt(dayIso, planIndex);
      if (logIdx >= 0) {
        removeCookedAt(dayIso, logIdx);
      }
    },
    [history, removeMealAt, removeCookedAt],
  );

  const openPicker = () => {
    if (!selectedIso) {
      return;
    }
    setPickQ("");
    setPickOpen(true);
  };

  const closePicker = () => {
    setPickOpen(false);
  };

  return (
    <div className="history-page">
      <header className="history-head">
        <div className="history-view-toggle" role="tablist" aria-label="Calendar view">
          <button
            type="button"
            role="tab"
            id="history-tab-month"
            aria-selected={granularity === "month"}
            aria-controls="history-calendar-panel"
            className="history-view-tab"
            data-on={granularity === "month"}
            onClick={selectMonthView}
          >
            Month
          </button>
          <button
            type="button"
            role="tab"
            id="history-tab-week"
            aria-selected={granularity === "week"}
            aria-controls="history-calendar-panel"
            className="history-view-tab"
            data-on={granularity === "week"}
            onClick={selectWeekView}
          >
            Week
          </button>
        </div>
      </header>

      <section className="history-calendar-section" aria-label="Calendar">
        <div className="history-month-nav">
          {granularity === "month" ? (
            <>
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
            </>
          ) : (
            <>
              <button
                type="button"
                className="history-month-btn"
                aria-label="Previous week"
                onClick={() =>
                  setWeekStart((d) => {
                    const n = addDays(d, -7);
                    n.setHours(12, 0, 0, 0);
                    return n;
                  })
                }
              >
                ‹
              </button>
              <span className="history-month-label history-month-label--week">{weekTitle}</span>
              <button
                type="button"
                className="history-month-btn"
                aria-label="Next week"
                onClick={() =>
                  setWeekStart((d) => {
                    const n = addDays(d, 7);
                    n.setHours(12, 0, 0, 0);
                    return n;
                  })
                }
              >
                ›
              </button>
            </>
          )}
        </div>

        {granularity === "month" ? (
          <div className="history-weekdays" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="history-weekday">
                {label}
              </div>
            ))}
          </div>
        ) : null}

        <div
          id="history-calendar-panel"
          role="tabpanel"
          aria-labelledby={granularity === "month" ? "history-tab-month" : "history-tab-week"}
        >
          {granularity === "month" ? (
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
          ) : (
            <div
              className="history-week-grid"
              role="list"
              aria-label={`${weekTitle} — calendar`}
            >
              {weekKeys.map((dayIso) => {
                const d = new Date(`${dayIso}T12:00:00`);
                const plannedForDay = plan[dayIso] ?? [];
                const loggedForDay = history[dayIso] ?? [];
                const planRefs = planSlotRefsOnDay(plan, dayIso);
                const logExtras = loggedRowsNotCoveredByPlan(loggedForDay, planRefs);
                const displayCount = plannedForDay.length + logExtras.length;
                const isToday = dayIso === todayIso;
                const isSelected = dayIso === selectedIso;
                const rel = dayRelativeToToday(dayIso, todayIso);
                const isFuture = rel === "future";
                const dayLong = d.toLocaleDateString(undefined, { weekday: "long" });
                const dayShort = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const emptyLine = isFuture ? "Nothing planned yet" : "Nothing logged";
                const emptyListAria = isFuture
                  ? `Nothing planned yet for ${dayLong}, ${dayShort}`
                  : `Nothing logged for ${dayLong}, ${dayShort}`;
                const listAria =
                  displayCount > 0
                    ? `Meals for ${dayLong}, ${dayShort} — on menu or cook log`
                    : emptyListAria;
                const headerAria =
                  displayCount > 0
                    ? `Select ${dayLong} ${dayShort}, ${displayCount} meal(s) on menu or logged`
                    : `Select ${dayLong} ${dayShort}, ${emptyLine.toLowerCase()}`;
                return (
                  <div
                    key={dayIso}
                    role="listitem"
                    className={`day-card${isToday ? " is-today" : ""}${
                      isSelected ? " history-day-card--selected" : ""
                    }`}
                  >
                    <div className="day-card-drop-area">
                      <button
                        type="button"
                        className="day-card-header history-day-card-select"
                        aria-pressed={isSelected}
                        aria-label={headerAria}
                        onClick={() => setSelectedIso((prev) => (prev === dayIso ? null : dayIso))}
                      >
                        <div className="day-head">{dayLong}</div>
                        <div className="day-date">{dayShort}</div>
                      </button>
                      <ul
                        className={`meal-chips${displayCount === 0 ? " meal-chips--empty" : ""}`}
                        aria-label={listAria}
                      >
                        {displayCount === 0 ? (
                          <li className="meal-chips-empty">
                            <span className="meal-chips-empty-text">{emptyLine}</span>
                          </li>
                        ) : (
                          <>
                            {plannedForDay.map((meal, planIndex) => {
                              const hasCookLog = planMealHasCookLogLine(meal, loggedForDay);
                              const showMarkCooked = !hasCookLog && !isFuture;
                              return (
                                <li
                                  key={`plan-${dayIso}-${meal.planSlotRef ?? `i-${planIndex}`}-${meal.id}`}
                                  className={`history-day-meal-row history-day-meal-row--in-week${
                                    hasCookLog ? "" : " history-day-meal-row--planned"
                                  }`}
                                >
                                  <Link
                                    to={recipeDetailPath(
                                      meal.id,
                                      meal.kind === "side",
                                      undefined,
                                      false,
                                      true,
                                    )}
                                    className="history-day-meal-title"
                                  >
                                    {meal.title}
                                  </Link>
                                  {showMarkCooked ? (
                                    <button
                                      type="button"
                                      className="history-day-meal-log-cooked"
                                      aria-label={`Log ${meal.title} as cooked`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markPlannedMealAsCooked(dayIso, meal, planIndex);
                                      }}
                                    >
                                      Log cooked
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="history-day-meal-remove"
                                    aria-label={`Remove ${meal.title} from meal plan`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removePlannedMealFromDay(dayIso, planIndex, meal);
                                    }}
                                  >
                                    ×
                                  </button>
                                </li>
                              );
                            })}
                            {logExtras.map(({ meal, logIndex }) => (
                              <li
                                key={`log-${dayIso}-${logIndex}-${meal.id}`}
                                className="history-day-meal-row history-day-meal-row--in-week"
                              >
                                <Link
                                  to={recipeDetailPath(
                                    meal.id,
                                    meal.kind === "side",
                                    undefined,
                                    false,
                                    true,
                                  )}
                                  className="history-day-meal-title"
                                >
                                  {meal.title}
                                </Link>
                                <button
                                  type="button"
                                  className="history-day-meal-remove"
                                  aria-label={`Remove ${meal.title} from cook log`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeCookedAt(dayIso, logIndex);
                                  }}
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </>
                        )}
                      </ul>
                      <div className="add-meal">
                        {isFuture ? (
                          <button
                            type="button"
                            onClick={() => navigate(recipesAddToPlanPath(dayIso))}
                          >
                            + Plan meal
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIso(dayIso);
                              setPickQ("");
                              setPickOpen(true);
                            }}
                          >
                            + Log meal
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section
        className="history-summary"
        aria-label={granularity === "month" ? "Month summary" : "Week summary"}
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
          {stats.most ? (
            <>
              <div className="history-summary-most">{stats.most.title}</div>
              <div className="history-summary-label">Most cooked</div>
              <div className="history-summary-sub">{stats.most.count} times</div>
            </>
          ) : (
            <>
              <div className="history-summary-most history-summary-most--muted">—</div>
              <div className="history-summary-label">Most cooked</div>
              <div className="history-summary-sub">No data yet</div>
            </>
          )}
        </div>
      </section>

      {granularity === "month" && selectedIso ? (
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
                    key={`${selectedIso}-plan-${meal.planSlotRef ?? `i-${planIndex}`}-${meal.id}`}
                    className={`history-day-meal-row${
                      hasCookLog ? "" : " history-day-meal-row--planned"
                    }`}
                  >
                    <Link
                      to={recipeDetailPath(meal.id, meal.kind === "side", undefined, false, true)}
                      className="history-day-meal-title"
                    >
                      {meal.title}
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
                planSlotRefsOnDay(plan, selectedIso),
              ).map(({ meal, logIndex }) => (
                <li key={`${selectedIso}-log-${logIndex}-${meal.id}`} className="history-day-meal-row">
                  <Link
                    to={recipeDetailPath(meal.id, meal.kind === "side", undefined, false, true)}
                    className="history-day-meal-title"
                  >
                    {meal.title}
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
      ) : !selectedIso ? (
        <p className="muted history-hint">
          {granularity === "month" ? (
            <>
              Select a day on the calendar. A dot means there is something on the menu and/or logged:
              cream = menu only (not logged yet), mint = at least one meal logged.{" "}
            </>
          ) : (
            <>
              Week view matches the meal planner. Future days: <strong>+ Plan meal</strong> opens
              recipes to schedule that day. Today and past days: <strong>+ Log meal</strong> adds a
              cook log.{" "}
            </>
          )}
          Use <strong>Week</strong> or <strong>Month</strong> to change the view.
        </p>
      ) : null}

      <div
        className={`planner-overlay${pickOpen ? " open" : ""}`}
        aria-hidden={!pickOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closePicker();
          }
        }}
      >
        <div className="planner-sheet" role="dialog" aria-labelledby="historyPickTitle" aria-modal="true">
          <div className="planner-sheet-head">
            <h2 id="historyPickTitle">Log a meal</h2>
            <p className="muted picker-subtitle" style={{ marginTop: 0 }}>
              Choose a recipe for{" "}
              {selectedIso
                ? new Date(`${selectedIso}T12:00:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : ""}
            </p>
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
                  if (selectedIso) {
                    logRecipeCooked(selectedIso, r);
                  }
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
