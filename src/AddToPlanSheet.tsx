import * as React from "react";
import type { Recipe } from "./types";
import { buildWeekKeys, startOfWeekMonday } from "./mealPlanDates";
import { MEAL_PLAN_UNASSIGNED_KEY } from "./mealPlanStorage";
import { useMealPlan } from "./MealPlanContext";

type Props = {
  recipe: Recipe | null;
  open: boolean;
  onClose: () => void;
};

export function AddToPlanSheet({ recipe, open, onClose }: Props) {
  const { addRecipeToPlanKey } = useMealPlan();
  const weekStart = React.useMemo(() => startOfWeekMonday(new Date()), []);
  const weekKeys = React.useMemo(() => buildWeekKeys(weekStart), [weekStart]);

  const pick = (key: string) => {
    if (!recipe) {
      return;
    }
    addRecipeToPlanKey(key, recipe);
    onClose();
  };

  if (!open || !recipe) {
    return null;
  }

  return (
    <div
      className="planner-overlay open"
      aria-hidden={false}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="planner-sheet" role="dialog" aria-labelledby="addToPlanTitle">
        <div className="planner-sheet-head">
          <h2 id="addToPlanTitle">Add to plan</h2>
          <p className="picker-subtitle" style={{ marginTop: 0 }}>
            <strong>{recipe.title}</strong> — choose a day this week, or leave it unassigned and
            place it on the Plan tab later.
          </p>
        </div>
        <div className="planner-sheet-body add-to-plan-day-grid">
          <button
            type="button"
            className="pick-row add-to-plan-day-btn"
            onClick={() => pick(MEAL_PLAN_UNASSIGNED_KEY)}
          >
            <span>Unassigned</span>
          </button>
          {weekKeys.map((key) => {
            const d = new Date(`${key}T12:00:00`);
            const label = d.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            });
            return (
              <button key={key} type="button" className="pick-row add-to-plan-day-btn" onClick={() => pick(key)}>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
        <div className="planner-sheet-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
