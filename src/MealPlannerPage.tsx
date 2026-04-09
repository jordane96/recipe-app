import * as React from "react";
import { Link } from "react-router-dom";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import type { IngredientDef, Recipe } from "./types";
import { shoppingListPath } from "./listTabSearch";
import {
  flattenPlanRecipeIdsInOrder,
  loadMealPlan,
  normalizePlanMainBeforeSide,
  saveMealPlan,
  sortMealsMainBeforeSide,
  type MealPlanByDate,
  type PlannedMeal,
} from "./mealPlanStorage";
import { recipeSegment } from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6);
  const a = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

type PickerStep = "pick-main" | "pick-side";

const MEAL_DRAG_MIME = "application/x-meal-plan-meal+json";

type MealDragPayload = { fromKey: string; fromIndex: number };

export function MealPlannerPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { addToList, removeFromList, hydrateShoppingIfEmpty, count } = useShoppingList();
  const recipeById = React.useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const mainsPool = React.useMemo(
    () =>
      recipes
        .filter((r) => {
          const s = recipeSegment(r);
          return s === "main" || s === "other";
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
  );

  const sidesPool = React.useMemo(
    () =>
      recipes
        .filter((r) => recipeSegment(r) === "side")
        .sort((a, b) => a.title.localeCompare(b.title)),
    [recipes],
  );

  const [weekStart, setWeekStart] = React.useState(() => startOfWeekMonday(new Date()));
  const [plan, setPlan] = React.useState<MealPlanByDate>(() =>
    typeof window === "undefined" ? {} : normalizePlanMainBeforeSide(loadMealPlan()),
  );
  const initialPlanForHydrate = React.useRef(plan);

  React.useEffect(() => {
    saveMealPlan(plan);
  }, [plan]);

  React.useEffect(() => {
    hydrateShoppingIfEmpty(flattenPlanRecipeIdsInOrder(initialPlanForHydrate.current));
  }, [hydrateShoppingIfEmpty]);

  const [pickerDate, setPickerDate] = React.useState<string | null>(null);
  const [pickerStep, setPickerStep] = React.useState<PickerStep>("pick-main");
  const [pendingMain, setPendingMain] = React.useState<PlannedMeal | null>(null);
  const [step1ListKind, setStep1ListKind] = React.useState<"main" | "side">("main");
  const [pickerQuery, setPickerQuery] = React.useState("");

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

  const openPicker = (dateKey: string) => {
    setPickerDate(dateKey);
    setPickerStep("pick-main");
    setPendingMain(null);
    setStep1ListKind("main");
    setPickerQuery("");
  };

  const closePicker = () => {
    setPickerDate(null);
    setPickerStep("pick-main");
    setPendingMain(null);
    setStep1ListKind("main");
    setPickerQuery("");
  };

  const recipeToPlanned = (r: Recipe): PlannedMeal => ({
    id: r.id,
    title: r.title,
    kind: recipeSegment(r) === "side" ? "side" : "main",
  });

  const finishAddMeals = (entries: PlannedMeal[]) => {
    if (!pickerDate) {
      return;
    }
    setPlan((prev) => {
      const next = { ...prev };
      const cur = sortMealsMainBeforeSide([...(next[pickerDate] ?? []), ...entries]);
      next[pickerDate] = cur;
      return next;
    });
    for (const e of entries) {
      addToList(e.id);
    }
    closePicker();
  };

  const removeMealAt = (dateKey: string, index: number) => {
    const row = plan[dateKey];
    const removed = row?.[index];
    if (!removed) {
      return;
    }
    const next: MealPlanByDate = { ...plan };
    const cur = [...(next[dateKey] ?? [])];
    cur.splice(index, 1);
    if (cur.length === 0) {
      delete next[dateKey];
    } else {
      next[dateKey] = sortMealsMainBeforeSide(cur);
    }
    setPlan(next);
    removeFromList(removed.id);
  };

  const clearWeek = () => {
    if (!window.confirm("Clear all meals from this week?")) {
      return;
    }
    const start = iso(weekStart);
    const end = iso(addDays(weekStart, 6));
    const mealsDropped: PlannedMeal[] = [];
    for (const [key, meals] of Object.entries(plan)) {
      if (key >= start && key <= end) {
        mealsDropped.push(...meals);
      }
    }
    const next: MealPlanByDate = { ...plan };
    for (const k of Object.keys(next)) {
      if (k >= start && k <= end) {
        delete next[k];
      }
    }
    setPlan(next);
    for (const m of mealsDropped) {
      removeFromList(m.id);
    }
  };

  const moveMealToDay = React.useCallback((fromKey: string, fromIndex: number, toKey: string) => {
    setPlan((prev) => {
      const src = [...(prev[fromKey] ?? [])];
      if (fromIndex < 0 || fromIndex >= src.length) {
        return prev;
      }
      const [meal] = src.splice(fromIndex, 1);
      const next: MealPlanByDate = { ...prev };
      if (src.length === 0) {
        delete next[fromKey];
      } else {
        next[fromKey] = sortMealsMainBeforeSide(src);
      }
      const dest = sortMealsMainBeforeSide([...(next[toKey] ?? []), meal]);
      next[toKey] = dest;
      return next;
    });
  }, []);

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

  const pickerPool =
    pickerStep === "pick-main"
      ? step1ListKind === "main"
        ? mainsPool
        : sidesPool
      : sidesPool;

  const filteredPicker = React.useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) {
      return pickerPool;
    }
    return pickerPool.filter((r) => r.title.toLowerCase().includes(q));
  }, [pickerPool, pickerQuery]);

  const pickerDateLabel =
    pickerDate &&
    new Date(`${pickerDate}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

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
                      aria-label={`${m.title}. Drag to another day.`}
                      onDragStart={(e) => handleChipDragStart(e, key, idx)}
                      onDragEnd={handleChipDragEnd}
                      onDragOver={onDayDragOver}
                      onDrop={onChipDrop}
                    >
                      <span
                        className="meal-chip-handle"
                        aria-hidden="true"
                        title="Drag to another day"
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

      {/* Add-meal sheet */}
      <div
        className={`planner-overlay${pickerDate ? " open" : ""}`}
        aria-hidden={!pickerDate}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closePicker();
          }
        }}
      >
        <div className="planner-sheet" role="dialog" aria-labelledby="sheetTitle">
          <div className="planner-sheet-head">
            <h2 id="sheetTitle">
              {pickerStep === "pick-main"
                ? `Add meal · ${pickerDateLabel ?? ""}`
                : `Optional side · ${pickerDateLabel ?? ""}`}
            </h2>
            {pickerStep === "pick-side" && pendingMain ? (
              <p className="picker-subtitle">
                With <strong>{pendingMain.title}</strong>. Pick a side or skip.
              </p>
            ) : null}
            <input
              className="search planner-sheet-search"
              type="search"
              placeholder={
                pickerStep === "pick-main"
                  ? step1ListKind === "main"
                    ? "Filter mains…"
                    : "Filter sides…"
                  : "Filter sides…"
              }
              autoComplete="off"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
            />
            {pickerStep === "pick-main" ? (
              <div className="picker-kind-tabs" role="tablist" aria-label="Mains or sides">
                <button
                  type="button"
                  role="tab"
                  aria-selected={step1ListKind === "main"}
                  data-on={step1ListKind === "main"}
                  onClick={() => {
                    setStep1ListKind("main");
                    setPickerQuery("");
                  }}
                >
                  Mains
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={step1ListKind === "side"}
                  data-on={step1ListKind === "side"}
                  onClick={() => {
                    setStep1ListKind("side");
                    setPickerQuery("");
                  }}
                >
                  Sides
                </button>
              </div>
            ) : null}
          </div>
          <div className="planner-sheet-body">
            {filteredPicker.length === 0 ? (
              <p className="muted" style={{ padding: "0.5rem 0.75rem" }}>
                No recipes match.
              </p>
            ) : (
              filteredPicker.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="pick-row"
                  onClick={() => {
                    if (!pickerDate) {
                      return;
                    }
                    if (pickerStep === "pick-main") {
                      const seg = recipeSegment(r);
                      if (seg === "side") {
                        finishAddMeals([recipeToPlanned(r)]);
                        return;
                      }
                      setPendingMain(recipeToPlanned(r));
                      setPickerStep("pick-side");
                      setPickerQuery("");
                    } else {
                      if (pendingMain) {
                        finishAddMeals([pendingMain, recipeToPlanned(r)]);
                      }
                    }
                  }}
                >
                  <span>{r.title}</span>
                  <span className="pick-row-meta">
                    <span className={`planner-badge${recipeSegment(r) === "side" ? " side" : ""}`}>
                      {recipeSegment(r) === "side" ? "Side" : "Main"}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="planner-sheet-foot">
            {pickerStep === "pick-side" ? (
              <button
                type="button"
                className="btn-skip-side"
                onClick={() => {
                  if (pendingMain) {
                    finishAddMeals([pendingMain]);
                  }
                }}
              >
                Skip — no side
              </button>
            ) : null}
            <div className="planner-sheet-foot-row">
              {pickerStep === "pick-side" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPendingMain(null);
                    setPickerStep("pick-main");
                    setPickerQuery("");
                  }}
                >
                  ← Change main
                </button>
              ) : null}
              <button type="button" className="btn-secondary" onClick={closePicker}>
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
