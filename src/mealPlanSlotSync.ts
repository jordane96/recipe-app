import {
  MEAL_PLAN_UNASSIGNED_KEY,
  isMealPlanDateKey,
  newPlanSlotRef,
  normalizePlanMainBeforeSide,
  portionCountOf,
  sortMealsMainBeforeSide,
  type MealPlanByDate,
} from "./mealPlanStorage";
import { expectedCountForRecipe } from "./mealPlanShopping";

type MirroredByDay = Map<string, Set<string>>;

function mirroredRefsByDay(plan: MealPlanByDate): MirroredByDay {
  const u = plan[MEAL_PLAN_UNASSIGNED_KEY] ?? [];
  const map: MirroredByDay = new Map();
  for (const m of u) {
    if (m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) && m.planSlotRef) {
      const d = m.scheduledForDay;
      const s = map.get(d) ?? new Set<string>();
      s.add(m.planSlotRef);
      map.set(d, s);
    }
  }
  return map;
}

function removeCalendarMirrorRow(
  next: MealPlanByDate,
  scheduledForDay: string,
  planSlotRef: string,
): void {
  if (!isMealPlanDateKey(scheduledForDay)) {
    return;
  }
  const drow = [...(next[scheduledForDay] ?? [])];
  const di = drow.findIndex((x) => x.planSlotRef === planSlotRef);
  if (di < 0) {
    return;
  }
  drow.splice(di, 1);
  if (drow.length === 0) {
    delete next[scheduledForDay];
  } else {
    next[scheduledForDay] = sortMealsMainBeforeSide(drow);
  }
}

/**
 * Remove one slot that counts toward {@link flattenPlanRecipeIdsInOrder} for this recipe
 * (last such slot in flatten order).
 */
export function removeOneExpectedSlotForRecipe(
  plan: MealPlanByDate,
  recipeId: string,
): { plan: MealPlanByDate; removed: boolean } {
  const mirrored = mirroredRefsByDay(plan);
  const next: MealPlanByDate = { ...plan };
  const uk = MEAL_PLAN_UNASSIGNED_KEY;

  const u = [...(next[uk] ?? [])];
  for (let i = u.length - 1; i >= 0; i--) {
    const m = u[i];
    if (m.id !== recipeId) {
      continue;
    }
    const n = portionCountOf(m);
    if (n > 1) {
      u[i] = { ...m, portionCount: n - 1 };
      next[uk] = sortMealsMainBeforeSide(u);
      return { plan: next, removed: true };
    }
    if (m.scheduledForDay && isMealPlanDateKey(m.scheduledForDay) && m.planSlotRef) {
      removeCalendarMirrorRow(next, m.scheduledForDay, m.planSlotRef);
    }
    u.splice(i, 1);
    if (u.length === 0) {
      delete next[uk];
    } else {
      next[uk] = sortMealsMainBeforeSide(u);
    }
    return { plan: next, removed: true };
  }

  const dayKeys = Object.keys(next)
    .filter((k) => isMealPlanDateKey(k))
    .sort()
    .reverse();
  for (const dayKey of dayKeys) {
    const row = [...(next[dayKey] ?? [])];
    const mir = mirrored.get(dayKey);
    for (let i = row.length - 1; i >= 0; i--) {
      const m = row[i];
      if (m.id !== recipeId) {
        continue;
      }
      if (m.planSlotRef && mir?.has(m.planSlotRef)) {
        continue;
      }
      const pn = portionCountOf(m);
      if (pn > 1) {
        row[i] = { ...m, portionCount: pn - 1 };
        next[dayKey] = sortMealsMainBeforeSide(row);
        return { plan: next, removed: true };
      }
      row.splice(i, 1);
      if (row.length === 0) {
        delete next[dayKey];
      } else {
        next[dayKey] = sortMealsMainBeforeSide(row);
      }
      return { plan: next, removed: true };
    }
  }

  return { plan: next, removed: false };
}

export function addUnassignedSlotsForRecipe(
  plan: MealPlanByDate,
  recipeId: string,
  meta: { title: string; kind: "main" | "side" },
  count: number,
): MealPlanByDate {
  const c = Math.max(0, Math.min(999, Math.floor(Number(count))));
  if (c === 0) {
    return plan;
  }
  const next: MealPlanByDate = { ...plan };
  const uk = MEAL_PLAN_UNASSIGNED_KEY;
  const u = [...(next[uk] ?? [])];
  for (let k = 0; k < c; k++) {
    u.push({
      id: recipeId,
      title: meta.title,
      kind: meta.kind,
      planSlotRef: newPlanSlotRef(),
      portionCount: 1,
    });
  }
  next[uk] = sortMealsMainBeforeSide(u);
  return next;
}

/** Adjust the meal plan so expected shopping slots for recipeId equal targetCount. */
export function reconcilePlanRecipeSlotCount(
  plan: MealPlanByDate,
  recipeId: string,
  targetCount: number,
  meta: { title: string; kind: "main" | "side" },
): MealPlanByDate {
  const t = Math.max(0, Math.min(999, Math.floor(Number(targetCount))));
  let work: MealPlanByDate = { ...plan };
  while (expectedCountForRecipe(work, recipeId) > t) {
    const { plan: n, removed } = removeOneExpectedSlotForRecipe(work, recipeId);
    work = n;
    if (!removed) {
      break;
    }
  }
  const needAdd = t - expectedCountForRecipe(work, recipeId);
  if (needAdd > 0) {
    work = addUnassignedSlotsForRecipe(work, recipeId, meta, needAdd);
  }
  return normalizePlanMainBeforeSide(work);
}
