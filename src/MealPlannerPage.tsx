import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import type { IngredientDef, Recipe } from "./types";
import { recipesAddToPlanPath, shoppingListPath } from "./listTabSearch";
import { addDays, iso, startOfWeekMonday, weekRangeLabel } from "./mealPlanDates";
import { useMealPlan } from "./MealPlanContext";
import {
  MEAL_PLAN_UNASSIGNED_KEY,
  sortMealsMainBeforeSide,
  type PlannedMeal,
} from "./mealPlanStorage";
import { useShoppingList } from "./ShoppingListContext";

const MEAL_DRAG_MIME = "application/x-meal-plan-meal+json";

type MealDragPayload = { fromKey: string; fromIndex: number };

export function MealPlannerPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { count } = useShoppingList();
  const navigate = useNavigate();
  const { plan, unassignedKey, removeMealAt, moveMealToDay, clearWeekDateRange } = useMealPlan();
  const recipeById = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const [weekStart, setWeekStart] = React.useState(() => startOfWeekMonday(new Date()));

  const [readSlot, setReadSlot] = React.useState<PlannedMeal | null>(null);
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

  return (
    <div className="planner-page">
      <header className="planner-head">
        <div className="planner-head-row">
          <h1 className="page-title planner-title">Meal planner</h1>
          <div className="planner-head-actions">
            <Link to="/recipes" className="list-header-link">
              Recipes
            </Link>
            <Link to={shoppingListPath(false)} className="shopping-pill">
              List{count > 0 ? ` (${count})` : ""}
            </Link>
          </div>
        </div>
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
        <section className="planner-unassigned" aria-label="Unassigned meals">
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
                <div className="day-head">Unassigned</div>
              </div>
              <ul className="meal-chips">
                {unassignedMeals.map((m, idx) => (
                  <li
                    key={`${unassignedKey}-${idx}-${m.id}`}
                    className={`meal-chip${m.kind === "side" ? " side" : ""}${
                      mealDrag?.fromKey === unassignedKey && mealDrag.fromIndex === idx
                        ? " meal-chip--dragging"
                        : ""
                    }`}
                    draggable
                    aria-label={`${m.title}. Drag to a day below.`}
                    onDragStart={(e) => handleChipDragStart(e, unassignedKey, idx)}
                    onDragEnd={handleChipDragEnd}
                    onDragOver={(e) => handleDayDragOver(e, unassignedKey)}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handleDayDrop(e, unassignedKey);
                    }}
                  >
                    <span className="meal-chip-handle" aria-hidden="true" title="Drag to a day">
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="meal-chip-title"
                      draggable={false}
                      aria-label={`Open recipe: ${m.title}`}
                      onClick={() => setReadSlot(m)}
                    >
                      {m.title}
                    </button>
                    <button
                      type="button"
                      className="meal-chip-x"
                      draggable={false}
                      aria-label={`Remove ${m.title}`}
                      onClick={() => removeMealAt(unassignedKey, idx)}
                    >
                      ×
                    </button>
                  </li>
                ))}
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
                <ul className="meal-chips" onDragOver={onDayDragOver} onDrop={onDayDrop}>
                  {meals.map((m, idx) => (
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
                      <span
                        className="meal-chip-handle"
                        aria-hidden="true"
                        title="Drag to another day or Unassigned"
                      >
                        ⋮⋮
                      </span>
                      <button
                        type="button"
                        className="meal-chip-title"
                        draggable={false}
                        aria-label={`Open recipe: ${m.title}`}
                        onClick={() => setReadSlot(m)}
                      >
                        {m.title}
                      </button>
                      <button
                        type="button"
                        className="meal-chip-x"
                        draggable={false}
                        aria-label={`Remove ${m.title}`}
                        onClick={() => removeMealAt(key, idx)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="add-meal">
                  <button
                    type="button"
                    onClick={() => openPicker(key)}
                    onDragOver={onDayDragOver}
                    onDrop={onDayDrop}
                  >
                    + Add meal
                  </button>
                </div>
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
