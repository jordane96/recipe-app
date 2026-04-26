import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  addCookProgressSessionsBatch,
  getFirstActiveCookSessionHref,
} from "./cookProgressSession";
import { recipeCookModePath, recipesAddMealForCookingPath } from "./listTabSearch";
import { addDays, iso, startOfWeekMonday } from "./mealPlanDates";
import { useMealPlan } from "./MealPlanContext";
import { useCookHistory } from "./CookHistoryContext";
import { isMealPlanDateKey, portionCountOf, type PlannedMeal } from "./mealPlanStorage";
import {
  isDaySlotCooked,
  isUnassignedSlotCookedAllTime,
  unassignedSlotShownInPlannerWeek,
} from "./mealPlannerCookUi";

type MenuPillU = {
  kind: "u";
  key: string;
  planIdx: number;
  meal: PlannedMeal;
};

type MenuPillD = {
  kind: "d";
  key: string;
  dayKey: string;
  index: number;
  meal: PlannedMeal;
};

type MenuPill = MenuPillU | MenuPillD;

function formatDayShort(isoDateKey: string): string {
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

/**
 * Shown when there is no active cook session — e.g. after canceling the last one, or
 * from the nav. Redirects to the first in-progress cook URL when a session exists.
 */
export function CookingNowPage() {
  const navigate = useNavigate();
  const { plan, unassignedKey, ensureUnassignedSlotRef, ensureCalendarSlotRef } = useMealPlan();
  const { history } = useCookHistory();
  const [rev, setRev] = React.useState(0);

  React.useEffect(() => {
    const on = () => setRev((n) => n + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, on);
  }, []);

  const nextCookHref = React.useMemo(() => getFirstActiveCookSessionHref(), [rev]);

  const weekStart = React.useMemo(() => startOfWeekMonday(new Date()), []);
  const weekKeys = React.useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(iso(addDays(weekStart, i)));
    }
    return keys;
  }, [weekStart]);

  const unassignedMeals = plan[unassignedKey] ?? [];
  const todayIso = React.useMemo(() => iso(new Date()), []);

  const unassignedPlanIndicesForVisibleWeek = React.useMemo(() => {
    return unassignedMeals
      .map((_, planIdx) => planIdx)
      .filter((planIdx) =>
        unassignedSlotShownInPlannerWeek(history, weekKeys, unassignedMeals, planIdx),
      );
  }, [unassignedMeals, history]);

  const unassignedMealsDisplayOrder = React.useMemo(() => {
    const order = [...unassignedPlanIndicesForVisibleWeek];
    order.sort((a, b) => {
      const cookedA = isUnassignedSlotCookedAllTime(history, unassignedMeals, a, unassignedMeals[a]!.id)
        ? 1
        : 0;
      const cookedB = isUnassignedSlotCookedAllTime(history, unassignedMeals, b, unassignedMeals[b]!.id)
        ? 1
        : 0;
      if (cookedA !== cookedB) {
        return cookedA - cookedB;
      }
      return a - b;
    });
    return order;
  }, [unassignedPlanIndicesForVisibleWeek, unassignedMeals, history]);

  const unassignedUncookedDisplayOrder = React.useMemo(
    () =>
      unassignedMealsDisplayOrder.filter(
        (planIdx) =>
          !isUnassignedSlotCookedAllTime(
            history,
            unassignedMeals,
            planIdx,
            unassignedMeals[planIdx]!.id,
          ),
      ),
    [unassignedMealsDisplayOrder, history, unassignedMeals],
  );

  const menuPills: MenuPill[] = React.useMemo(() => {
    const uPills: MenuPillU[] = unassignedUncookedDisplayOrder.map((planIdx) => ({
      kind: "u" as const,
      key: `u:${planIdx}`,
      planIdx,
      meal: unassignedMeals[planIdx]!,
    }));
    const refsU = new Set(
      uPills.map((p) => p.meal.planSlotRef).filter((r): r is string => Boolean(r && r.length > 0)),
    );
    const dPills: MenuPillD[] = [];
    for (const dayKey of weekKeys) {
      const meals = plan[dayKey] ?? [];
      for (let idx = 0; idx < meals.length; idx++) {
        const m = meals[idx]!;
        if (isDaySlotCooked(history, dayKey, meals, idx, m.id)) {
          continue;
        }
        if (m.planSlotRef && refsU.has(m.planSlotRef)) {
          continue;
        }
        dPills.push({ kind: "d", key: `d:${dayKey}:${idx}`, dayKey, index: idx, meal: m });
      }
    }
    return [...uPills, ...dPills];
  }, [
    plan,
    history,
    weekKeys,
    unassignedMeals,
    unassignedUncookedDisplayOrder,
  ]);

  const menuSig = menuPills.map((p) => p.key).join("|");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    setSelected(new Set());
  }, [menuSig]);

  const onMealRowClick = React.useCallback((e: React.MouseEvent<HTMLLIElement>, key: string) => {
    const t = e.target as HTMLElement;
    if (t.closest("label.meal-chip-select-cook-wrap, input.meal-chip-select-cook")) {
      return;
    }
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
      } else {
        n.add(key);
      }
      return n;
    });
  }, []);

  const onMealRowKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLLIElement>, key: string) => {
    if (e.key !== "Enter" && e.key !== " ") {
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("label.meal-chip-select-cook-wrap, input")) {
      return;
    }
    e.preventDefault();
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(key)) {
        n.delete(key);
      } else {
        n.add(key);
      }
      return n;
    });
  }, []);

  const cookNowDisabled = React.useMemo(
    () => selected.size === 0 || menuPills.length === 0,
    [selected, menuPills.length],
  );

  const handleCookNow = React.useCallback(() => {
    if (selected.size === 0) {
      return;
    }
    const ordered = menuPills.filter((p) => selected.has(p.key));
    if (ordered.length === 0) {
      return;
    }
    const items = ordered.map((p) => {
      if (p.kind === "u") {
        const m = p.meal;
        const slotRef = m.planSlotRef ?? ensureUnassignedSlotRef(p.planIdx);
        const cookDate =
          m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) ? m.scheduledForDay : todayIso;
        return {
          recipeId: m.id,
          cookDate,
          planSlotRef: slotRef,
          title: m.title,
        };
      }
      const m = p.meal;
      const ref = m.planSlotRef ?? ensureCalendarSlotRef(p.dayKey, p.index);
      return {
        recipeId: m.id,
        cookDate: p.dayKey,
        planSlotRef: ref,
        title: m.title,
      };
    });
    addCookProgressSessionsBatch(items);
    const first = ordered[0]!;
    if (first.kind === "u") {
      const m = first.meal;
      const slot = m.planSlotRef ?? ensureUnassignedSlotRef(first.planIdx) ?? null;
      const d =
        m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) ? m.scheduledForDay : todayIso;
      navigate(recipeCookModePath(m.id, d, slot));
    } else {
      const m = first.meal;
      const slot = m.planSlotRef ?? ensureCalendarSlotRef(first.dayKey, first.index) ?? null;
      navigate(recipeCookModePath(m.id, first.dayKey, slot));
    }
  }, [selected, menuPills, ensureUnassignedSlotRef, ensureCalendarSlotRef, todayIso, navigate]);

  React.useEffect(() => {
    if (nextCookHref) {
      navigate(nextCookHref, { replace: true });
    }
  }, [nextCookHref, navigate]);

  if (nextCookHref) {
    return null;
  }

  const hasMenu = menuPills.length > 0;
  const pickToCookListHref = recipesAddMealForCookingPath(iso(weekStart));

  return (
    <div className="cooking-now-page">
      {!hasMenu ? (
        <h1 className="cooking-now-page-title">Pick what you want to cook</h1>
      ) : null}

      {hasMenu ? (
        <div className="cooking-now-menu-block">
          <h1 className="cooking-now-menu-heading" id="cooking-now-menu-heading">
            This week&apos;s menu
          </h1>
          <p className="cooking-now-page-hint cooking-now-menu-hint" role="status">
            Select one or more meals, then start the checklist.
          </p>
          <ul
            className="meal-chips cooking-now-menu-chips"
            aria-labelledby="cooking-now-menu-heading"
          >
            {menuPills.map((p) => {
              const m = p.meal;
              const isSel = selected.has(p.key);
              return (
                <li
                  key={p.key}
                  className={`meal-chip meal-chip--cook-selectable cooking-now-menu-chip${
                    m.kind === "side" ? " side" : ""
                  }${isSel ? " meal-chip--cook-selected" : ""}`}
                  tabIndex={0}
                  onClick={(e) => onMealRowClick(e, p.key)}
                  onKeyDown={(e) => onMealRowKeyDown(e, p.key)}
                >
                  <div className="meal-chip-title-row">
                    <label
                      className="meal-chip-select-cook-wrap"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="meal-chip-select-cook"
                        checked={isSel}
                        aria-label={`Select ${m.title} for cook now`}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (e.target.checked) {
                            setSelected((prev) => new Set([...prev, p.key]));
                          } else {
                            setSelected((prev) => {
                              const n = new Set(prev);
                              n.delete(p.key);
                              return n;
                            });
                          }
                        }}
                      />
                    </label>
                    <div className="meal-chip-name-portion">
                      <span className="meal-chip-title meal-chip-title--cooking-now-text">
                        {m.title}
                        {portionCountOf(m) > 1 ? (
                          <span className="meal-chip-portion-inline"> × {portionCountOf(m)}</span>
                        ) : null}
                      </span>
                      {p.kind === "d" ? (
                        <span className="cooking-now-pill-when">
                          {formatDayShort(p.dayKey)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="cooking-now-page-cta cta-panel">
            <button
              type="button"
              className="btn-primary btn-cta-wide"
              disabled={cookNowDisabled}
              onClick={handleCookNow}
              aria-label={
                cookNowDisabled
                  ? "Cook now — select one or more meals above"
                  : `Cook now — open cook checklist for ${selected.size} selected meal${selected.size === 1 ? "" : "s"}`
              }
            >
              Cook now
            </button>
          </div>
        </div>
      ) : null}

      {!hasMenu ? (
        <p className="cooking-now-page-hint" role="status">
          Your menu is empty, select a meal to cook
        </p>
      ) : null}

      {!hasMenu ? (
        <div className="cooking-now-page-cta cta-panel">
          <Link
            to={pickToCookListHref}
            className="btn-primary btn-cta-wide"
            aria-label="Browse recipes to choose a meal to cook"
          >
            Browse recipes
          </Link>
        </div>
      ) : null}
    </div>
  );
}
