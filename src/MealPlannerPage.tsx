import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import type { IngredientDef, Recipe } from "./types";
import { recipeCookModePath, recipesAddToPlanPath, shoppingListPath } from "./listTabSearch";
import { addDays, iso, startOfWeekMonday, weekRangeLabel } from "./mealPlanDates";
import { useMealPlan } from "./MealPlanContext";
import { recipeSegment } from "./recipeCourse";
import {
  isMealPlanDateKey,
  MEAL_PLAN_UNASSIGNED_KEY,
  portionCountOf,
  type PlannedMeal,
} from "./mealPlanStorage";
import { shoppingDiscrepancies } from "./mealPlanShopping";
import {
  mealPlanShouldFollowShoppingList,
  usePlanShoppingAuthorityVersion,
} from "./planShoppingAuthority";
import { useShoppingList } from "./ShoppingListContext";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  addCookProgressSessionsBatch,
  isPlanMealCookInProgress,
} from "./cookProgressSession";
import { useCookHistory } from "./CookHistoryContext";
import {
  findDaySlotHistoryIndex,
  findUnassignedSlotHistoryLocation,
  isDaySlotCooked,
  isUnassignedSlotCooked,
} from "./mealPlannerCookUi";

const MEAL_DRAG_MIME = "application/x-meal-plan-meal+json";

function formatPlannerDayShort(isoDateKey: string): string {
  if (!isMealPlanDateKey(isoDateKey)) {
    return isoDateKey;
  }
  const d = new Date(`${isoDateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type MealDragPayload = { fromKey: string; fromIndex: number };

export function MealPlannerPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { selectedIds } = useShoppingList();
  const navigate = useNavigate();
  const {
    plan,
    unassignedKey,
    removeMealAt,
    moveMealToDay,
    assignUnassignedToCalendarDay,
    ensureUnassignedSlotRef,
    clearUnassignedScheduledDay,
    adjustUnassignedPortionCount,
    clearWeekDateRange,
    syncPlanRecipeSlotsToShoppingCount,
  } = useMealPlan();
  const { history, removeCookedAt } = useCookHistory();

  const recipeById = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const [weekStart, setWeekStart] = React.useState(() => startOfWeekMonday(new Date()));

  const [readSlot, setReadSlot] = React.useState<PlannedMeal | null>(null);
  const [assignUnassignedIndex, setAssignUnassignedIndex] = React.useState<number | null>(null);
  const [mealDrag, setMealDrag] = React.useState<MealDragPayload | null>(null);
  const [dropTargetKey, setDropTargetKey] = React.useState<string | null>(null);

  const weekKeys = React.useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(iso(addDays(weekStart, i)));
    }
    return keys;
  }, [weekStart]);

  const unassignedMeals = plan[unassignedKey] ?? [];
  const hasUnassignedMeals = unassignedMeals.length > 0;

  const unassignedCookSelectSig = React.useMemo(
    () => unassignedMeals.map((m, i) => `${i}:${m.id}:${m.planSlotRef ?? ""}`).join("|"),
    [unassignedMeals],
  );
  const [unassignedCookSelect, setUnassignedCookSelect] = React.useState<Set<number>>(() => new Set());

  React.useEffect(() => {
    setUnassignedCookSelect(new Set());
  }, [unassignedCookSelectSig]);

  const assignUnassignedMeal =
    assignUnassignedIndex != null ? unassignedMeals[assignUnassignedIndex] : undefined;

  React.useEffect(() => {
    if (
      assignUnassignedIndex != null &&
      (assignUnassignedIndex < 0 || assignUnassignedIndex >= unassignedMeals.length)
    ) {
      setAssignUnassignedIndex(null);
    }
  }, [assignUnassignedIndex, unassignedMeals.length]);

  const openPicker = (dateKey: string) => {
    navigate(
      dateKey === unassignedKey
        ? recipesAddToPlanPath(dateKey, iso(weekStart))
        : recipesAddToPlanPath(dateKey),
    );
  };

  const clearWeek = () => {
    if (!window.confirm("Clear all meals from this week?")) {
      return;
    }
    clearWeekDateRange(iso(weekStart), iso(addDays(weekStart, 6)));
  };

  const handleChipDragStart = React.useCallback(
    (e: React.DragEvent, fromKey: string, fromIndex: number) => {
      const raw = JSON.stringify({ fromKey, fromIndex } satisfies MealDragPayload);
      e.dataTransfer.setData(MEAL_DRAG_MIME, raw);
      e.dataTransfer.setData("text/plain", raw);
      e.dataTransfer.effectAllowed = "move";
      setMealDrag({ fromKey, fromIndex });
    },
    [],
  );

  const handleChipDragEnd = React.useCallback(() => {
    setMealDrag(null);
    setDropTargetKey(null);
  }, []);

  const handleDayDragOver = React.useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetKey(key);
  }, []);

  const handleDayDrop = React.useCallback(
    (e: React.DragEvent, toKey: string) => {
      e.preventDefault();
      setDropTargetKey(null);
      const raw =
        e.dataTransfer.getData(MEAL_DRAG_MIME) || e.dataTransfer.getData("text/plain");
      if (!raw) {
        return;
      }
      let payload: MealDragPayload;
      try {
        payload = JSON.parse(raw) as MealDragPayload;
      } catch {
        return;
      }
      if (typeof payload.fromKey !== "string" || typeof payload.fromIndex !== "number") {
        return;
      }
      moveMealToDay(payload.fromKey, payload.fromIndex, toKey);
    },
    [moveMealToDay],
  );

  const readRecipe = readSlot ? recipeById.get(readSlot.id) : undefined;

  const todayIso = iso(new Date());

  const unassignedCookNowDisabled = React.useMemo(() => {
    if (unassignedCookSelect.size === 0) {
      return true;
    }
    for (const idx of unassignedCookSelect) {
      if (idx < 0 || idx >= unassignedMeals.length) {
        continue;
      }
      const m = unassignedMeals[idx]!;
      if (!isUnassignedSlotCooked(history, weekKeys, unassignedMeals, idx, m.id)) {
        return false;
      }
    }
    return true;
  }, [history, unassignedCookSelect, unassignedMeals, weekKeys]);

  const handleUnassignedCookNow = React.useCallback(() => {
    if (unassignedCookSelect.size === 0) {
      return;
    }
    const indices = [...unassignedCookSelect]
      .filter((idx) => idx >= 0 && idx < unassignedMeals.length)
      .filter((idx) => {
        const m = unassignedMeals[idx]!;
        return !isUnassignedSlotCooked(history, weekKeys, unassignedMeals, idx, m.id);
      })
      .sort((a, b) => a - b);
    if (indices.length === 0) {
      return;
    }
    const items = indices.map((idx) => {
      const m = unassignedMeals[idx]!;
      const slotRef = m.planSlotRef ?? ensureUnassignedSlotRef(idx);
      const cookDate =
        m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay)
          ? m.scheduledForDay
          : todayIso;
      return {
        recipeId: m.id,
        cookDate,
        planSlotRef: slotRef,
        title: m.title,
      };
    });
    addCookProgressSessionsBatch(items);
    const first = unassignedMeals[indices[0]!]!;
    const firstRef = first.planSlotRef ?? ensureUnassignedSlotRef(indices[0]!);
    const firstCookDate = items[0]!.cookDate;
    navigate(recipeCookModePath(first.id, firstCookDate, firstRef ?? null));
  }, [
    ensureUnassignedSlotRef,
    history,
    navigate,
    todayIso,
    unassignedCookSelect,
    unassignedMeals,
    weekKeys,
  ]);

  const toggleUnassignedCookSelectAt = React.useCallback((idx: number) => {
    setUnassignedCookSelect((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const handleUnassignedMealChipRowClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>, idx: number, cooked: boolean) => {
      if (cooked) {
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest("button, a, input, textarea, select, label.meal-chip-select-cook-wrap")) {
        return;
      }
      toggleUnassignedCookSelectAt(idx);
    },
    [toggleUnassignedCookSelectAt],
  );

  const [cookProgressRev, setCookProgressRev] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => setCookProgressRev((r) => r + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
  }, []);
  void cookProgressRev;

  const assignSheetOpen =
    assignUnassignedIndex != null &&
    assignUnassignedIndex >= 0 &&
    assignUnassignedIndex < unassignedMeals.length;

  const authVersion = usePlanShoppingAuthorityVersion();
  const shoppingLeadingMismatches = React.useMemo(() => {
    void authVersion;
    return shoppingDiscrepancies(plan, selectedIds).filter((d) =>
      mealPlanShouldFollowShoppingList(d.recipeId),
    );
  }, [plan, selectedIds, authVersion]);

  const shoppingLeadingSig = shoppingLeadingMismatches
    .map((d) => `${d.recipeId}:${d.expected}:${d.actual}`)
    .join("|");
  const [dismissShoppingLeadingBanner, setDismissShoppingLeadingBanner] = React.useState(false);
  React.useEffect(() => {
    setDismissShoppingLeadingBanner(false);
  }, [shoppingLeadingSig]);

  return (
    <div className="planner-page">
      {shoppingLeadingMismatches.length > 0 && !dismissShoppingLeadingBanner ? (
        <div className="planner-sync-banner" role="status">
          <p className="planner-sync-banner-text">
            Your <strong>shopping list</strong> was updated last and doesn&apos;t match the meal plan.
            Sync the plan to match your list?
          </p>
          <div className="planner-sync-banner-actions">
            <button
              type="button"
              className="btn-primary planner-sync-banner-primary"
              onClick={() => {
                for (const d of shoppingLeadingMismatches) {
                  const r = recipeById.get(d.recipeId);
                  if (!r) {
                    continue;
                  }
                  syncPlanRecipeSlotsToShoppingCount(d.recipeId, d.actual, {
                    title: r.title,
                    kind: recipeSegment(r) === "side" ? "side" : "main",
                  });
                }
                setDismissShoppingLeadingBanner(true);
              }}
            >
              Sync meal plan
            </button>
            <Link className="btn-secondary planner-sync-banner-secondary" to={shoppingListPath(false)}>
              Open shopping list
            </Link>
            <button
              type="button"
              className="btn-ghost planner-sync-banner-dismiss"
              onClick={() => setDismissShoppingLeadingBanner(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      <header className="planner-head">
        <div className="week-nav" aria-label="Week navigation">
          <button
            type="button"
            className="week-nav-btn"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
          >
            ‹
          </button>
          <span className="week-label">{weekRangeLabel(weekStart)}</span>
          <button
            type="button"
            className="week-nav-btn"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
          >
            ›
          </button>
        </div>
      </header>

      {hasUnassignedMeals ? (
        <section className="planner-unassigned" aria-labelledby="planner-this-week-menu-heading">
          <div
            className={`planner-unassigned-drop day-card${
              dropTargetKey === unassignedKey ? " day-card--drop-target" : ""
            }`}
            onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
            onDrop={(e) => handleDayDrop(e, unassignedKey)}
          >
            <div className="day-card-drop-area">
              <div
                className="day-card-header"
                onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
                onDrop={(e) => handleDayDrop(e, unassignedKey)}
              >
                <div className="day-head" id="planner-this-week-menu-heading">
                  This week&apos;s menu
                </div>
              </div>
              <ul className="meal-chips">
                {unassignedMeals.map((m, idx) => {
                  const unassignedCooked = isUnassignedSlotCooked(
                    history,
                    weekKeys,
                    unassignedMeals,
                    idx,
                    m.id,
                  );
                  const unassignedCookInProgress = isPlanMealCookInProgress(
                    m.id,
                    todayIso,
                    m.planSlotRef,
                  );
                  return (
                  <li
                    key={`${unassignedKey}-${idx}-${m.id}`}
                    className={`meal-chip meal-chip--has-assign${m.kind === "side" ? " side" : ""}${
                      !unassignedCooked ? " meal-chip--cook-selectable" : ""
                    }${
                      !unassignedCooked && unassignedCookSelect.has(idx)
                        ? " meal-chip--cook-selected"
                        : ""
                    }${
                      mealDrag?.fromKey === unassignedKey && mealDrag.fromIndex === idx
                        ? " meal-chip--dragging"
                        : ""
                    }`}
                    draggable
                    aria-label={
                      unassignedCooked
                        ? m.scheduledForDay
                          ? `${m.title}. Drag to a day, or use Edit to change which day.`
                          : `${m.title}. Drag to a day, or use Set day to choose which day.`
                        : m.scheduledForDay
                          ? `${m.title}. Click row to select for Cook now, or drag to a day, or use Edit to change which day.`
                          : `${m.title}. Click row to select for Cook now, or drag to a day, or use Set day to choose which day.`
                    }
                    onClick={(e) => handleUnassignedMealChipRowClick(e, idx, unassignedCooked)}
                    onDragStart={(e) => handleChipDragStart(e, unassignedKey, idx)}
                    onDragEnd={handleChipDragEnd}
                    onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDayDrop(e, unassignedKey);
                    }}
                  >
                    <div className="meal-chip-title-row">
                      {!unassignedCooked ? (
                        <label
                          className="meal-chip-select-cook-wrap"
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="meal-chip-select-cook"
                            checked={unassignedCookSelect.has(idx)}
                            aria-label={`Select ${m.title} for cook now`}
                            onChange={(e) => {
                              e.stopPropagation();
                              const checked = e.target.checked;
                              setUnassignedCookSelect((prev) => {
                                const next = new Set(prev);
                                if (checked) {
                                  next.add(idx);
                                } else {
                                  next.delete(idx);
                                }
                                return next;
                              });
                            }}
                          />
                        </label>
                      ) : (
                        <span className="meal-chip-check-slot" aria-hidden="true" />
                      )}
                      <div className="meal-chip-name-portion">
                        <button
                          type="button"
                          className="meal-chip-title"
                          draggable={false}
                          aria-label={
                            unassignedCooked
                              ? `View recipe: ${m.title}`
                              : `Select ${m.title} for Cook now (double-click to view recipe)`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            if (unassignedCooked) {
                              setReadSlot(m);
                              return;
                            }
                            if (e.detail !== 1) {
                              return;
                            }
                            toggleUnassignedCookSelectAt(idx);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setReadSlot(m);
                          }}
                        >
                          {m.title}
                        </button>
                        <div className="meal-chip-portion-controls">
                          <button
                            type="button"
                            className="meal-chip-portion-btn"
                            draggable={false}
                            aria-label={`Remove one portion for ${m.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustUnassignedPortionCount(idx, -1);
                            }}
                          >
                            −
                          </button>
                          <span
                            className="meal-chip-portion-value"
                            aria-label={`Portions: ${portionCountOf(m)}`}
                          >
                            {portionCountOf(m)}
                          </span>
                          <button
                            type="button"
                            className="meal-chip-portion-btn"
                            draggable={false}
                            aria-label={`Add one portion for ${m.title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              adjustUnassignedPortionCount(idx, 1);
                            }}
                          >
                            +
                          </button>
                        </div>
                        {unassignedCooked ? (
                          <div className="meal-chip-cook-prompt">
                            <button
                              type="button"
                              className="meal-chip-cooked-badge"
                              draggable={false}
                              title="Click to unmark as cooked"
                              aria-label={`${m.title} is logged as cooked. Click to remove`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const loc = findUnassignedSlotHistoryLocation(
                                  history,
                                  weekKeys,
                                  unassignedMeals,
                                  idx,
                                  m.id,
                                );
                                if (loc) {
                                  removeCookedAt(loc.dateIso, loc.index);
                                }
                              }}
                            >
                              ✓ Cooked
                            </button>
                          </div>
                        ) : unassignedCookInProgress ? (
                          <div className="meal-chip-cook-prompt">
                            <button
                              type="button"
                              className="meal-chip-in-progress"
                              draggable={false}
                              aria-label={`${m.title} — in progress. Open cook checklist`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const resumeDate =
                                  m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay)
                                    ? m.scheduledForDay
                                    : todayIso;
                                navigate(recipeCookModePath(m.id, resumeDate, m.planSlotRef ?? null));
                              }}
                            >
                              In progress
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="meal-chip-actions">
                      {m.scheduledForDay ? (
                        <div className="meal-chip-scheduled-with-edit">
                          <span
                            className="meal-chip-scheduled-date"
                            title={m.scheduledForDay}
                          >
                            {formatPlannerDayShort(m.scheduledForDay)}
                          </span>
                          <button
                            type="button"
                            className="meal-chip-day-edit"
                            draggable={false}
                            aria-label={`Change day for ${m.title} (currently ${formatPlannerDayShort(m.scheduledForDay)})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignUnassignedIndex(idx);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="meal-chip-assign"
                          draggable={false}
                          aria-label={`Set day for ${m.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignUnassignedIndex(idx);
                          }}
                        >
                          Set day
                        </button>
                      )}
                      <button
                        type="button"
                        className="meal-chip-x"
                        draggable={false}
                        aria-label={`Remove ${m.title}`}
                        onClick={() => removeMealAt(unassignedKey, idx)}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
              <div className="add-meal">
                <button
                  type="button"
                  onClick={() => openPicker(unassignedKey)}
                  onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
                  onDrop={(e) => handleDayDrop(e, unassignedKey)}
                >
                  + Add meal
                </button>
              </div>
              <div className="planner-unassigned-cook-cta">
                <button
                  type="button"
                  className="btn-primary btn-cta-wide"
                  disabled={unassignedCookNowDisabled}
                  aria-label={
                    unassignedCookNowDisabled
                      ? "Cook now — select one or more meals below"
                      : `Cook now — open cook checklist for ${unassignedCookSelect.size} selected meal${unassignedCookSelect.size === 1 ? "" : "s"}`
                  }
                  onClick={handleUnassignedCookNow}
                >
                  Cook now
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section
          className={`planner-unassigned-inline${
            dropTargetKey === unassignedKey ? " planner-unassigned-inline--drop-target" : ""
          }`}
          aria-label="Add meals for the week — not yet on a day, or drop a meal here from a day"
          onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
          onDrop={(e) => handleDayDrop(e, unassignedKey)}
        >
          <button
            type="button"
            className="btn-primary btn-cta-wide planner-unassigned-inline-btn"
            onClick={() => openPicker(unassignedKey)}
          >
            Add meals for the week
          </button>
        </section>
      )}

      <div className="week-grid">
        {weekKeys.map((key) => {
          const d = new Date(`${key}T12:00:00`);
          const meals = plan[key] ?? [];
          const isToday = key === todayIso;
          const onDayDragOver = (e: React.DragEvent) => handleDayDragOver(e, key);
          const onDayDrop = (e: React.DragEvent) => handleDayDrop(e, key);
          const onChipDrop = (e: React.DragEvent) => {
            e.stopPropagation();
            handleDayDrop(e, key);
          };
          return (
            <div
              key={key}
              className={`day-card${isToday ? " is-today" : ""}${
                dropTargetKey === key ? " day-card--drop-target" : ""
              }`}
            >
              <div className="day-card-drop-area">
                <div className="day-card-header" onDragOver={onDayDragOver} onDrop={onDayDrop}>
                  <div className="day-head">{d.toLocaleDateString(undefined, { weekday: "long" })}</div>
                  <div className="day-date">
                    {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
                <ul
                  className={`meal-chips${meals.length === 0 ? " meal-chips--empty" : ""}`}
                  onDragOver={onDayDragOver}
                  onDrop={onDayDrop}
                  aria-label={
                    meals.length === 0
                      ? "No meals planned for this day"
                      : `Planned meals for ${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`
                  }
                >
                  {meals.length === 0 ? (
                    <li className="meal-chips-empty">
                      <span className="meal-chips-empty-text">Nothing planned yet</span>
                    </li>
                  ) : (
                  meals.map((m, idx) => {
                    const daySlotCooked = isDaySlotCooked(history, key, meals, idx, m.id);
                    const dayCookInProgress = isPlanMealCookInProgress(m.id, key, m.planSlotRef);
                    return (
                    <li
                      key={`${key}-${idx}-${m.id}`}
                      className={`meal-chip${m.kind === "side" ? " side" : ""}${
                        mealDrag?.fromKey === key && mealDrag.fromIndex === idx
                          ? " meal-chip--dragging"
                          : ""
                      }`}
                      draggable
                      aria-label={`${m.title}. Drag to another day or Unassigned.`}
                      onDragStart={(e) => handleChipDragStart(e, key, idx)}
                      onDragEnd={handleChipDragEnd}
                      onDragOver={onDayDragOver}
                      onDrop={onChipDrop}
                    >
                      <button
                        type="button"
                        className="meal-chip-title"
                        draggable={false}
                        aria-label={`Open recipe: ${m.title}`}
                        onClick={() => setReadSlot(m)}
                      >
                        {m.title}
                        {portionCountOf(m) > 1 ? (
                          <span className="meal-chip-portion-inline"> × {portionCountOf(m)}</span>
                        ) : null}
                      </button>
                      {daySlotCooked ? (
                        <div className="meal-chip-cook-prompt">
                          <button
                            type="button"
                            className="meal-chip-cooked-badge"
                            draggable={false}
                            title="Click to unmark as cooked"
                            aria-label={`${m.title} is logged as cooked for this day. Click to remove`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const i = findDaySlotHistoryIndex(history, key, meals, idx, m.id);
                              if (i != null) {
                                removeCookedAt(key, i);
                              }
                            }}
                          >
                            ✓ Cooked
                          </button>
                        </div>
                      ) : (
                        <div className="meal-chip-cook-prompt">
                          {dayCookInProgress ? (
                            <button
                              type="button"
                              className="meal-chip-in-progress"
                              draggable={false}
                              aria-label={`${m.title} — in progress. Open cook checklist`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(recipeCookModePath(m.id, key, m.planSlotRef ?? null));
                              }}
                            >
                              In progress
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="meal-chip-cook-now"
                              draggable={false}
                              aria-label={`Cook now — open ${m.title} with step checklist`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(recipeCookModePath(m.id, key, m.planSlotRef ?? null));
                              }}
                            >
                              Cook now
                            </button>
                          )}
                        </div>
                      )}
                      <div className="meal-chip-actions">
                        <button
                          type="button"
                          className="meal-chip-x"
                          draggable={false}
                          aria-label={`Remove ${m.title}`}
                          onClick={() => removeMealAt(key, idx)}
                        >
                          ×
                        </button>
                      </div>
                    </li>
                    );
                  })
                  )}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <div className="planner-week-actions">
        <button type="button" className="btn-ghost" onClick={clearWeek}>
          Clear week plan
        </button>
      </div>

      {/* Assign unassigned meal to a day */}
      <div
        className={`planner-overlay planner-overlay--assign${assignSheetOpen ? " open" : ""}`}
        aria-hidden={!assignSheetOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setAssignUnassignedIndex(null);
          }
        }}
      >
        <div className="planner-sheet" role="dialog" aria-labelledby="assignDayTitle" aria-modal="true">
          <div className="planner-sheet-head">
            <h2 id="assignDayTitle">Set the day</h2>
            {assignSheetOpen && assignUnassignedMeal ? (
              <>
                <p className="muted planner-assign-subtitle">{assignUnassignedMeal.title}</p>
                <p className="muted planner-assign-subtitle" style={{ marginTop: "0.25rem" }}>
                  Stays in this week&apos;s menu; also appears on the day you pick.
                </p>
              </>
            ) : null}
          </div>
          <div className="planner-sheet-body planner-assign-body">
            {weekKeys.map((dayKey) => {
              const d = new Date(`${dayKey}T12:00:00`);
              const wk = d.toLocaleDateString(undefined, { weekday: "long" });
              const dt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
              const isToday = dayKey === todayIso;
              return (
                <button
                  key={dayKey}
                  type="button"
                  className={`planner-assign-day-btn${isToday ? " is-today" : ""}`}
                  onClick={() => {
                    if (assignUnassignedIndex == null) {
                      return;
                    }
                    assignUnassignedToCalendarDay(assignUnassignedIndex, dayKey);
                    setAssignUnassignedIndex(null);
                  }}
                >
                  <span className="planner-assign-day-label">{wk}</span>
                  <span className="muted planner-assign-day-date">{dt}</span>
                </button>
              );
            })}
          </div>
          <div className="planner-sheet-foot">
            <div className="planner-sheet-foot-row planner-sheet-foot-row--assign-actions">
              {assignSheetOpen &&
              assignUnassignedMeal?.scheduledForDay &&
              assignUnassignedIndex != null ? (
                <button
                  type="button"
                  className="btn-ghost"
                  aria-label={`Remove day for ${assignUnassignedMeal.title}; meal stays on this week’s menu only`}
                  onClick={() => {
                    clearUnassignedScheduledDay(assignUnassignedIndex);
                    setAssignUnassignedIndex(null);
                  }}
                >
                  Remove day
                </button>
              ) : null}
              <button type="button" className="btn-secondary" onClick={() => setAssignUnassignedIndex(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recipe quick-read */}
      <div
        className={`planner-overlay planner-overlay--recipe${readSlot ? " open" : ""}`}
        aria-hidden={!readSlot}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setReadSlot(null);
          }
        }}
      >
        <div className="planner-sheet planner-read-sheet" role="dialog" aria-labelledby="readTitle">
          <div className="planner-sheet-head">
            <h2 id="readTitle">{readSlot?.title ?? "Recipe"}</h2>
            {readSlot ? (
              <span className={`read-kind-badge${readSlot.kind === "side" ? " side" : ""}`}>
                {readSlot.kind === "side" ? "Side" : "Main"}
              </span>
            ) : null}
          </div>
          <div className="planner-read-body">
            {!readRecipe ? (
              <p className="muted">This recipe is no longer in your library.</p>
            ) : (
              <>
                <h3>Ingredients</h3>
                <ul>
                  {(readRecipe.ingredientSections ?? []).flatMap((sec) =>
                    sec.lines.map((line, i) => (
                      <li key={`${sec.name}-${i}`}>
                        {sec.name ? (
                          <span className="muted" style={{ fontSize: "0.85em" }}>
                            {sec.name}:{" "}
                          </span>
                        ) : null}
                        {formatIngredientLine(line, byId)}
                      </li>
                    )),
                  )}
                </ul>
                <h3>Instructions</h3>
                <ol>
                  {(readRecipe.instructions ?? []).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <div className="planner-sheet-foot">
            <button type="button" className="btn-secondary" onClick={() => setReadSlot(null)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
