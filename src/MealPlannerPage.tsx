import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { recipeCookModePath, recipeDetailFromMenuPath, recipesAddToPlanPath, shoppingListPath } from "./listTabSearch";
import { addDays, iso, startOfWeekMonday } from "./mealPlanDates";
import { useMealPlan } from "./MealPlanContext";
import { isMealPlanDateKey, portionCountOf, type PlannedMeal } from "./mealPlanStorage";
import { useShoppingList } from "./ShoppingListContext";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  addCookProgressSessionsBatch,
  isPlanMealCookInProgress,
} from "./cookProgressSession";
import { useCookHistory } from "./CookHistoryContext";
import {
  cookedUnassignedAnchorDateIso,
  findUnassignedSlotHistoryLocation,
  isUnassignedSlotCookedAllTime,
  sortedHistoryDateKeys,
  unassignedSlotShownInPlannerWeek,
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
  ingredients: _ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { pushFromMenu } = useShoppingList();
  const navigate = useNavigate();
  const {
    plan,
    unassignedKey,
    removeMealAt,
    moveMealToDay,
    ensureUnassignedSlotRef,
    adjustUnassignedPortionCount,
  } = useMealPlan();
  const { history } = useCookHistory();

  const [mealDrag, setMealDrag] = React.useState<MealDragPayload | null>(null);
  const [dropTargetKey, setDropTargetKey] = React.useState<string | null>(null);

  /** Current local calendar day — when it changes, re-anchor the implicit “this week” to the new week. */
  const todayIso = iso(new Date());
  const weekStart = React.useMemo(() => startOfWeekMonday(new Date()), [todayIso]);
  const weekKeys = React.useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(iso(addDays(weekStart, i)));
    }
    return keys;
  }, [weekStart]);

  const historyDateKeys = React.useMemo(() => sortedHistoryDateKeys(history), [history]);

  const unassignedMeals = plan[unassignedKey] ?? [];
  const hasUnassignedMeals = unassignedMeals.length > 0;

  /** Unassigned pool rows: not-yet-cooked, or cooked in the last 7 days (see `unassignedSlotShownInPlannerWeek`). */
  const unassignedPlanIndicesForVisibleWeek = React.useMemo(() => {
    const meals = unassignedMeals;
    return meals
      .map((_, planIdx) => planIdx)
      .filter((planIdx) =>
        unassignedSlotShownInPlannerWeek(history, weekKeys, meals, planIdx),
      );
  }, [unassignedMeals, history]);

  /** Uncooked first; cooked sink to the bottom (display order only — handlers still use plan indices). */
  const unassignedMealsDisplayOrder = React.useMemo(() => {
    const meals = unassignedMeals;
    const order = [...unassignedPlanIndicesForVisibleWeek];
    order.sort((a, b) => {
      const cookedA = isUnassignedSlotCookedAllTime(history, meals, a, meals[a]!.id) ? 1 : 0;
      const cookedB = isUnassignedSlotCookedAllTime(history, meals, b, meals[b]!.id) ? 1 : 0;
      if (cookedA !== cookedB) {
        return cookedA - cookedB;
      }
      return a - b;
    });
    return order;
  }, [unassignedPlanIndicesForVisibleWeek, unassignedMeals, history]);

  const unassignedUncookedDisplayOrder = React.useMemo(() => {
    return unassignedMealsDisplayOrder.filter(
      (planIdx) =>
        !isUnassignedSlotCookedAllTime(
          history,
          unassignedMeals,
          planIdx,
          unassignedMeals[planIdx]!.id,
        ),
    );
  }, [unassignedMealsDisplayOrder, history, unassignedMeals]);

  const unassignedCookedDisplayOrder = React.useMemo(() => {
    return unassignedMealsDisplayOrder.filter((planIdx) =>
      isUnassignedSlotCookedAllTime(
        history,
        unassignedMeals,
        planIdx,
        unassignedMeals[planIdx]!.id,
      ),
    );
  }, [unassignedMealsDisplayOrder, history, unassignedMeals]);

  const unassignedCookSelectSig = React.useMemo(
    () => unassignedMeals.map((m, i) => `${i}:${m.id}:${m.planSlotRef ?? ""}`).join("|"),
    [unassignedMeals],
  );
  const [unassignedCookSelect, setUnassignedCookSelect] = React.useState<Set<number>>(() => new Set());

  React.useEffect(() => {
    setUnassignedCookSelect(new Set());
  }, [unassignedCookSelectSig]);

  const openPicker = (dateKey: string) => {
    navigate(
      dateKey === unassignedKey
        ? recipesAddToPlanPath(dateKey, iso(weekStart))
        : recipesAddToPlanPath(dateKey),
    );
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

  const goRecipeFromMenu = React.useCallback(
    (planIdx: number, m: PlannedMeal) => {
      const slotRef = m.planSlotRef ?? ensureUnassignedSlotRef(planIdx);
      const dateIso =
        m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) ? m.scheduledForDay : todayIso;
      navigate(
        recipeDetailFromMenuPath(m.id, {
          dateIso,
          planSlotRef: slotRef ?? null,
        }),
      );
    },
    [ensureUnassignedSlotRef, navigate, todayIso],
  );

  const unassignedCookNowDisabled = React.useMemo(() => {
    if (unassignedCookSelect.size === 0) {
      return true;
    }
    for (const idx of unassignedCookSelect) {
      if (idx < 0 || idx >= unassignedMeals.length) {
        continue;
      }
      const m = unassignedMeals[idx]!;
      if (!isUnassignedSlotCookedAllTime(history, unassignedMeals, idx, m.id)) {
        return false;
      }
    }
    return true;
  }, [history, unassignedCookSelect, unassignedMeals]);

  const hasShopableSelection = React.useMemo(() => {
    for (const idx of unassignedCookSelect) {
      if (idx < 0 || idx >= unassignedMeals.length) {
        continue;
      }
      const m = unassignedMeals[idx]!;
      if (!isUnassignedSlotCookedAllTime(history, unassignedMeals, idx, m.id)) {
        return true;
      }
    }
    return false;
  }, [unassignedCookSelect, unassignedMeals, history]);

  const handleUnassignedCookNow = React.useCallback(() => {
    if (unassignedCookSelect.size === 0) {
      return;
    }
    const indices = [...unassignedCookSelect]
      .filter((idx) => idx >= 0 && idx < unassignedMeals.length)
      .filter((idx) => {
        const m = unassignedMeals[idx]!;
        return !isUnassignedSlotCookedAllTime(history, unassignedMeals, idx, m.id);
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
  ]);

  const handleMenuShopIngredients = React.useCallback(() => {
    if (!hasShopableSelection) {
      return;
    }
    const flat: string[] = [];
    const uIndices = [...unassignedCookSelect]
      .filter((idx) => idx >= 0 && idx < unassignedMeals.length)
      .filter((idx) => {
        const m = unassignedMeals[idx]!;
        return !isUnassignedSlotCookedAllTime(history, unassignedMeals, idx, m.id);
      })
      .sort((a, b) => a - b);
    for (const idx of uIndices) {
      const m = unassignedMeals[idx]!;
      const n = portionCountOf(m);
      for (let p = 0; p < n; p += 1) {
        flat.push(m.id);
      }
    }
    if (flat.length === 0) {
      return;
    }
    pushFromMenu(flat);
    navigate(shoppingListPath(false));
  }, [hasShopableSelection, history, navigate, pushFromMenu, unassignedCookSelect, unassignedMeals]);

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

  const renderUnassignedPoolRow = (planIdx: number) => {
    const m = unassignedMeals[planIdx]!;
    const unassignedCooked = isUnassignedSlotCookedAllTime(
      history,
      unassignedMeals,
      planIdx,
      m.id,
    );
    const unassignedCookInProgress = isPlanMealCookInProgress(m.id, todayIso, m.planSlotRef);
    const cookLogLoc = unassignedCooked
      ? findUnassignedSlotHistoryLocation(history, historyDateKeys, unassignedMeals, planIdx, m.id)
      : null;
    const cookedDateIso =
      cookLogLoc?.dateIso ??
      (unassignedCooked ? cookedUnassignedAnchorDateIso(history, unassignedMeals, planIdx) : null);
    const cookedOnLabel = cookedDateIso != null ? formatPlannerDayShort(cookedDateIso) : null;
    return (
      <li
        key={`${unassignedKey}-${planIdx}-${m.planSlotRef ?? m.id}`}
        className={`meal-chip meal-chip--has-assign${m.kind === "side" ? " side" : ""}${
          unassignedCooked ? " meal-chip--logged-cooked" : ""
        }${!unassignedCooked ? " meal-chip--cook-selectable" : ""}${
          !unassignedCooked && unassignedCookSelect.has(planIdx) ? " meal-chip--cook-selected" : ""
        }${
          mealDrag?.fromKey === unassignedKey && mealDrag.fromIndex === planIdx ? " meal-chip--dragging" : ""
        }`}
        draggable
        aria-label={
          unassignedCooked
            ? `${m.title}. ${cookedOnLabel ? `${cookedOnLabel}. ` : ""}Logged as cooked.`
            : `${m.title}. Click row to select for Cook now or Shop ingredients.`
        }
        onClick={(e) => handleUnassignedMealChipRowClick(e, planIdx, unassignedCooked)}
        onDragStart={(e) => handleChipDragStart(e, unassignedKey, planIdx)}
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
                checked={unassignedCookSelect.has(planIdx)}
                aria-label={`Select ${m.title} for cook now`}
                onChange={(e) => {
                  e.stopPropagation();
                  const checked = e.target.checked;
                  setUnassignedCookSelect((prev) => {
                    const next = new Set(prev);
                    if (checked) {
                      next.add(planIdx);
                    } else {
                      next.delete(planIdx);
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
            <span className="meal-chip-title" draggable={false}>
              {m.title}
            </span>
            {unassignedCooked && cookedOnLabel ? (
              <div className="meal-chip-cooked-date">{cookedOnLabel}</div>
            ) : null}
            <div className="meal-chip-portion-controls">
              <button
                type="button"
                className="meal-chip-portion-btn"
                draggable={false}
                aria-label={`Remove one portion for ${m.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  adjustUnassignedPortionCount(planIdx, -1);
                }}
              >
                −
              </button>
              <span className="meal-chip-portion-value" aria-label={`Portions: ${portionCountOf(m)}`}>
                {portionCountOf(m)}
              </span>
              <button
                type="button"
                className="meal-chip-portion-btn"
                draggable={false}
                aria-label={`Add one portion for ${m.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  adjustUnassignedPortionCount(planIdx, 1);
                }}
              >
                +
              </button>
            </div>
            {!unassignedCooked && unassignedCookInProgress ? (
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
              <span className="meal-chip-scheduled-date" title={m.scheduledForDay}>
                {formatPlannerDayShort(m.scheduledForDay)}
              </span>
              <button
                type="button"
                className="meal-chip-day-edit"
                draggable={false}
                aria-label={`View recipe: ${m.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  goRecipeFromMenu(planIdx, m);
                }}
              >
                View
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="meal-chip-assign"
              draggable={false}
              aria-label={`View recipe: ${m.title}`}
              onClick={(e) => {
                e.stopPropagation();
                goRecipeFromMenu(planIdx, m);
              }}
            >
              View
            </button>
          )}
          <button
            type="button"
            className="meal-chip-x"
            draggable={false}
            aria-label={`Remove ${m.title}`}
            onClick={() => removeMealAt(unassignedKey, planIdx)}
          >
            ×
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="planner-page">
      {hasUnassignedMeals ? (
        <section
          className="planner-unassigned"
          aria-labelledby={
            unassignedCookedDisplayOrder.length > 0
              ? "planner-this-week-menu-heading planner-cooked-recently-heading"
              : "planner-this-week-menu-heading"
          }
        >
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
                {unassignedUncookedDisplayOrder.map((planIdx) => renderUnassignedPoolRow(planIdx))}
              </ul>
              <div className="add-meal add-meal--this-week">
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
                <button
                  type="button"
                  className="btn-secondary btn-cta-wide"
                  disabled={!hasShopableSelection}
                  aria-label={
                    !hasShopableSelection
                      ? "Shop ingredients — select meals on this week’s menu (replaces your shopping list when used)"
                      : "Shop ingredients — replace shopping list with selected meals and open list"
                  }
                  onClick={handleMenuShopIngredients}
                >
                  Shop ingredients
                </button>
              </div>
              {unassignedCookedDisplayOrder.length > 0 ? (
                <div className="planner-unassigned-cooked-section">
                  <div
                    className="day-card-header"
                    onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
                    onDrop={(e) => handleDayDrop(e, unassignedKey)}
                  >
                    <div className="day-head" id="planner-cooked-recently-heading">
                      Cooked recently
                    </div>
                  </div>
                  <ul className="meal-chips">
                    {unassignedCookedDisplayOrder.map((planIdx) => renderUnassignedPoolRow(planIdx))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section
          className={`planner-unassigned-inline${
            dropTargetKey === unassignedKey ? " planner-unassigned-inline--drop-target" : ""
          }`}
          aria-label="Add meals for the week to this list"
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

      {!hasUnassignedMeals ? (
        <div className="planner-week-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={!hasShopableSelection}
            aria-label={
              !hasShopableSelection
                ? "Shop ingredients — add meals above, select them, then use this (replaces your shopping list when used)"
                : "Shop ingredients — replace shopping list with selected meals and open list"
            }
            onClick={handleMenuShopIngredients}
          >
            Shop ingredients
          </button>
        </div>
      ) : null}
    </div>
  );
}
