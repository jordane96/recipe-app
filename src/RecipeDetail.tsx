import * as React from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe, RecommendedSideRef } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  ADD_TO_PLAN_QUERY,
  homeListPath,
  readCookModeParams,
  readFromHistory,
  readFromShopping,
  readPlanPhaseSide,
  readSidesListTab,
  recipeDetailBackPath,
  recipeDetailPath,
  recipeEditPath,
  urlParamToPlanKey,
} from "./listTabSearch";
import { useCookHistory } from "./CookHistoryContext";
import { recipeSegment } from "./recipeCourse";
import { MEAL_PLAN_UNASSIGNED_KEY } from "./mealPlanStorage";
import { useMealPlan } from "./MealPlanContext";
import { useToast } from "./ToastContext";
import {
  COOK_PROGRESS_CHANGED_EVENT,
  addCookProgressSession,
  cookProgressEntryHref,
  cookProgressSessionKey,
  getCookProgressSessions,
  removeCookProgressSession,
} from "./cookProgressSession";

/** Prepended in cook mode only — always step 1 before recipe instructions. */
const COOK_MODE_INGREDIENTS_CONFIRM_STEP = "Confirm you have all necessary ingredients";

function formatCookElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

type CookTimerPhase = "idle" | "running" | "paused";

type CookTimerModel = {
  phase: CookTimerPhase;
  accumulatedMs: number;
  segmentStartAt: number | null;
};

const COOK_TIMER_INITIAL: CookTimerModel = {
  phase: "idle",
  accumulatedMs: 0,
  segmentStartAt: null,
};

function cookTimerElapsedMs(model: CookTimerModel, now: number): number {
  if (model.phase === "running") {
    if (model.segmentStartAt != null) {
      return model.accumulatedMs + (now - model.segmentStartAt);
    }
    return model.accumulatedMs;
  }
  if (model.phase === "paused") {
    return model.accumulatedMs;
  }
  return 0;
}

type CookTimerAction =
  | { type: "RESET" }
  | { type: "START" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "CLEAR" };

function cookTimerReducer(state: CookTimerModel, action: CookTimerAction): CookTimerModel {
  const now = Date.now();
  switch (action.type) {
    case "RESET":
      return COOK_TIMER_INITIAL;
    case "START":
      if (state.phase !== "idle") {
        return state;
      }
      return { phase: "running", accumulatedMs: 0, segmentStartAt: now };
    case "PAUSE": {
      if (state.phase !== "running") {
        return state;
      }
      const seg = state.segmentStartAt;
      const add = seg != null ? now - seg : 0;
      return {
        phase: "paused",
        accumulatedMs: state.accumulatedMs + add,
        segmentStartAt: null,
      };
    }
    case "RESUME":
      if (state.phase !== "paused") {
        return state;
      }
      return { ...state, phase: "running", segmentStartAt: now };
    case "CLEAR":
      if (state.phase !== "paused") {
        return state;
      }
      return COOK_TIMER_INITIAL;
    default:
      return state;
  }
}

function RecipeCookModePanel({
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
  const { logCooked } = useCookHistory();
  const { assignUnassignedToCalendarDay, plan } = useMealPlan();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const [checkedSteps, setCheckedSteps] = React.useState<Set<number>>(() => new Set());
  const [cookTimer, dispatchCookTimer] = React.useReducer(cookTimerReducer, COOK_TIMER_INITIAL);
  const [, setTimerTick] = React.useState(0);
  const [cookProgressListRev, setCookProgressListRev] = React.useState(0);

  const hereHref = `${location.pathname}${location.search}`;

  React.useEffect(() => {
    setCheckedSteps(new Set());
    dispatchCookTimer({ type: "RESET" });
  }, [recipe.id, cookDate]);

  /** Subscribe before registering this cook so the same-mount `addCookProgressSession` event is not missed. */
  React.useEffect(() => {
    const onChange = () => setCookProgressListRev((r) => r + 1);
    window.addEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(COOK_PROGRESS_CHANGED_EVENT, onChange);
  }, []);

  React.useEffect(() => {
    addCookProgressSession(recipe.id, cookDate, cookSlotRef, recipe.title);
  }, [recipe.id, cookDate, cookSlotRef, recipe.title]);

  void cookProgressListRev;

  const cookSwitcherPills = React.useMemo(() => {
    const sessions = getCookProgressSessions();
    if (sessions.length <= 1) {
      return null;
    }
    return [...sessions]
      .map((e) => ({
        key: cookProgressSessionKey(e),
        href: cookProgressEntryHref(e),
        title: e.title,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }, [hereHref, cookProgressListRev]);

  const switchToCookSession = (targetHref: string) => {
    if (targetHref === hereHref) {
      return;
    }
    navigate(targetHref);
  };

  const handleCookSomethingElse = () => {
    navigate("/");
  };

  React.useEffect(() => {
    if (cookTimer.phase !== "running") {
      return;
    }
    const id = window.setInterval(() => setTimerTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [cookTimer.phase, cookTimer.segmentStartAt]);

  const instructions = recipe.instructions ?? [];
  const cookSteps = [COOK_MODE_INGREDIENTS_CONFIRM_STEP, ...instructions];
  const nSteps = cookSteps.length;

  const handleMarkCooked = () => {
    removeCookProgressSession(recipe.id, cookDate, cookSlotRef);
    logCooked(cookDate, {
      id: recipe.id,
      title: recipe.title,
      kind: recipeSegment(recipe) === "side" ? "side" : "main",
      ...(cookSlotRef ? { planSlotRef: cookSlotRef } : {}),
    });
    if (cookSlotRef) {
      const urow = plan[MEAL_PLAN_UNASSIGNED_KEY] ?? [];
      const unassignedIdx = urow.findIndex((m) => m.planSlotRef === cookSlotRef);
      if (unassignedIdx >= 0) {
        assignUnassignedToCalendarDay(unassignedIdx, cookDate);
      }
    }
    navigate("/");
  };

  const elapsedSeconds = Math.max(0, Math.floor(cookTimerElapsedMs(cookTimer, Date.now()) / 1000));

  const timerStart = () => {
    dispatchCookTimer({ type: "START" });
  };

  const timerPause = () => {
    dispatchCookTimer({ type: "PAUSE" });
  };

  const timerResume = () => {
    dispatchCookTimer({ type: "RESUME" });
  };

  const timerClear = () => {
    dispatchCookTimer({ type: "CLEAR" });
  };

  const toggleStep = (index: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="recipe-cook-mode">
      {cookSwitcherPills ? (
        <div className="recipe-cook-sibling-banner" role="group" aria-label="Switch between active recipes">
          <div className="recipe-cook-sibling-toggle">
            {cookSwitcherPills.map((p) => {
              const selected = p.href === hereHref;
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`recipe-cook-sibling-pill${selected ? " recipe-cook-sibling-pill--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => switchToCookSession(p.href)}
                >
                  {p.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="recipe-cook-timer-block" role="group" aria-label="Cooking timer">
        <span
          className={`recipe-cook-timer-readout${cookTimer.phase === "idle" ? " recipe-cook-timer-readout--idle" : ""}${cookTimer.phase === "paused" ? " recipe-cook-timer-readout--paused" : ""}`}
          aria-live="polite"
        >
          {formatCookElapsed(elapsedSeconds)}
        </span>
        <div className="recipe-cook-timer-actions">
          {cookTimer.phase === "idle" ? (
            <button type="button" className="recipe-cook-timer-action" onClick={timerStart}>
              Start
            </button>
          ) : null}
          {cookTimer.phase === "running" ? (
            <button type="button" className="recipe-cook-timer-action" onClick={timerPause}>
              Pause
            </button>
          ) : null}
          {cookTimer.phase === "paused" ? (
            <>
              <button type="button" className="recipe-cook-timer-action" onClick={timerResume}>
                Resume
              </button>
              <button type="button" className="recipe-cook-timer-action recipe-cook-timer-action--clear" onClick={timerClear}>
                Clear
              </button>
            </>
          ) : null}
        </div>
      </div>

      {recipe.ingredientSections?.map((sec) => (
        <section key={sec.name} className="detail-section recipe-cook-ingredients">
          <h2>{sec.name}</h2>
          {sec.lines.length === 0 ? (
            <p className="muted">No structured ingredients (see steps below).</p>
          ) : (
            <ul>
              {sec.lines.map((line, i) => (
                <li key={`${line.ingredientId}-${i}`}>{formatIngredientLine(line, byId)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="detail-section recipe-cook-steps-section">
        <h2>Steps</h2>
        <>
          <p className="muted recipe-cook-progress" aria-live="polite">
            {checkedSteps.size} of {nSteps} steps complete
          </p>
          <ol className="recipe-cook-step-list">
            {cookSteps.map((step, i) => {
              const id = `cook-step-${recipe.id}-${i}`;
              return (
                <li key={i} className="recipe-cook-step-item">
                  <label className="recipe-cook-step-label" htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      className="recipe-cook-step-check"
                      checked={checkedSteps.has(i)}
                      onChange={() => toggleStep(i)}
                    />
                    <span className="recipe-cook-step-text">{step}</span>
                  </label>
                </li>
              );
            })}
          </ol>
        </>
      </section>

      <div className="cta-panel cta-panel-bottom recipe-cook-cta">
        <button type="button" className="btn-primary btn-cta-wide" onClick={handleMarkCooked}>
          It's ready!
        </button>
        <Link
          to="/"
          className="btn-secondary btn-cta-wide recipe-detail-back-cta recipe-cook-back-bottom"
          onClick={() => removeCookProgressSession(recipe.id, cookDate, cookSlotRef)}
        >
          Cancel
        </Link>
        <button
          type="button"
          className="btn-secondary btn-cta-wide recipe-detail-back-cta recipe-cook-cook-else"
          onClick={handleCookSomethingElse}
        >
          Cook something else
        </button>
      </div>
    </div>
  );
}

export function RecipeDetail({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSidesList = readSidesListTab(searchParams);
  const fromShopping = readFromShopping(searchParams);
  const fromHistory = readFromHistory(searchParams);
  const planKey = urlParamToPlanKey(searchParams.get(ADD_TO_PLAN_QUERY));
  const inPlanFlow = planKey != null;
  const listSidesTab = inPlanFlow ? readPlanPhaseSide(searchParams) : fromSidesList;
  const preserve = inPlanFlow || fromShopping || fromHistory ? searchParams : undefined;

  const recipe = recipes.find((r) => r.id === id);
  const cookParams = readCookModeParams(searchParams);
  const { addRecipeToPlanKey } = useMealPlan();
  const { showToast } = useToast();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  const addTargetToPlan = React.useCallback(
    (r: Recipe) => {
      const key = planKey ?? MEAL_PLAN_UNASSIGNED_KEY;
      addRecipeToPlanKey(key, r);
      showToast(`Added “${r.title}” to your meal plan.`);
      if (planKey) {
        navigate(homeListPath(listSidesTab, preserve));
      }
    },
    [planKey, addRecipeToPlanKey, navigate, listSidesTab, preserve, showToast],
  );

  if (!recipe) {
    return (
      <>
        <div className="top-bar">
          <Link
            to={recipeDetailBackPath(listSidesTab, preserve, fromShopping, fromHistory)}
            className="back-btn"
          >
            Back
          </Link>
        </div>
        <p className="empty">Recipe not found.</p>
      </>
    );
  }

  if (cookParams.cookMode && cookParams.cookDate) {
    return (
      <RecipeCookModePanel
        recipe={recipe}
        cookDate={cookParams.cookDate}
        cookSlotRef={cookParams.cookSlotRef}
        ingredients={ingredients}
      />
    );
  }

  const recommended = recipe.recommendedSides ?? [];
  const sideRefs = React.useMemo(() => {
    const map = new Map<string, RecommendedSideRef>();
    for (const ref of recommended) {
      if (!map.has(ref.recipeId)) {
        map.set(ref.recipeId, ref);
      }
    }
    return [...map.entries()].map(([recipeId, ref]) => ({
      recipeId,
      label: ref.label,
      recipe: recipes.find((r) => r.id === recipeId),
    }));
  }, [recommended, recipes]);

  return (
    <>
      <div className="top-bar">
        <h1 className="page-title recipe-detail-page-title" style={{ fontSize: "1.25rem" }}>
          <span className="recipe-detail-headline">
            <span className="recipe-detail-title-text">{recipe.title}</span>
            <Link
              to={recipeEditPath(recipe.id, listSidesTab, preserve)}
              className="recipe-detail-edit-link"
            >
              edit
            </Link>
          </span>
          {recipe.type === "reference" ? (
            <span className="badge">Reference</span>
          ) : null}
          {recipeSegment(recipe) === "side" ? (
            <span className="badge badge-side">Side</span>
          ) : null}
        </h1>
      </div>
      {recipe.tags && recipe.tags.length > 0 ? (
        <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {recipe.tags.join(" · ")}
        </p>
      ) : null}

      {recipe.ingredientSections?.map((sec) => (
        <section key={sec.name} className="detail-section">
          <h2>{sec.name}</h2>
          {sec.lines.length === 0 ? (
            <p className="muted">No structured ingredients (see instructions).</p>
          ) : (
            <ul>
              {sec.lines.map((line, i) => (
                <li key={`${line.ingredientId}-${i}`}>
                  {formatIngredientLine(line, byId)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {sideRefs.length > 0 ? (
        <section className="detail-section recommended-sides-section">
          <h2>Recommended sides</h2>
          <p className="muted recommended-sides-intro">
            Open a side for full prep instructions. Use <strong>Add to plan</strong> to add to this meal
            {inPlanFlow ? "" : " (goes to This week’s menu; set a day from the Plan tab)"}.
          </p>
          <ul className="recommended-sides-list">
            {sideRefs.map(({ recipeId, label, recipe: sideRecipe }) => {
              return (
                <li key={recipeId} className="recommended-side-card">
                  <div className="recommended-side-head">
                    {sideRecipe ? (
                      <Link
                        to={recipeDetailPath(recipeId, listSidesTab, preserve)}
                        className="recommended-side-title"
                      >
                        {sideRecipe.title}
                      </Link>
                    ) : (
                      <span className="recommended-side-title missing-side">
                        Missing recipe: {recipeId}
                      </span>
                    )}
                    {sideRecipe ? (
                      <button
                        type="button"
                        className="btn-primary btn-compact"
                        onClick={() => addTargetToPlan(sideRecipe)}
                      >
                        Add to plan
                      </button>
                    ) : null}
                  </div>
                  {label ? <p className="muted recommended-side-label">{label}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {recipe.instructions && recipe.instructions.length > 0 ? (
        <section className="detail-section">
          <h2>Instructions</h2>
          <ol className="steps">
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.sourceUrl ? (
        <p className="detail-section">
          <a
            className="source-link"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Original recipe ↗
          </a>
        </p>
      ) : null}

      {recipe.notes ? (
        <p className="muted detail-section">{recipe.notes}</p>
      ) : null}

      <div className="cta-panel cta-panel-bottom">
        <button
          type="button"
          className="btn-primary btn-cta-wide"
          onClick={() => addTargetToPlan(recipe)}
        >
          Add to plan
        </button>
        <Link
          to={recipeDetailBackPath(listSidesTab, preserve, fromShopping, fromHistory)}
          className="btn-secondary btn-cta-wide recipe-detail-back-cta"
        >
          Back
        </Link>
      </div>

    </>
  );
}
