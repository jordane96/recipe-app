import type { RecipeInstructionStep } from "./ingredientTypes";

export type NormalizedInstructionStep = {
  text: string;
  durationSeconds?: number;
  stepIngredients?: string[];
};

function normalizeStepIngredientStrings(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return out.length > 0 ? out : undefined;
}

export function normalizeInstructionStep(step: RecipeInstructionStep): NormalizedInstructionStep {
  if (typeof step === "string") {
    return { text: step };
  }
  const text = typeof step.text === "string" ? step.text : "";
  const durationSeconds =
    typeof step.durationSeconds === "number" &&
    Number.isFinite(step.durationSeconds) &&
    step.durationSeconds > 0
      ? Math.floor(step.durationSeconds)
      : undefined;
  const stepIngredients = normalizeStepIngredientStrings(step.stepIngredients);
  const base: NormalizedInstructionStep = { text };
  if (durationSeconds != null) {
    base.durationSeconds = durationSeconds;
  }
  if (stepIngredients != null) {
    base.stepIngredients = stepIngredients;
  }
  return base;
}

export function normalizeInstructions(
  instructions: RecipeInstructionStep[] | undefined,
): NormalizedInstructionStep[] {
  if (!instructions?.length) {
    return [];
  }
  return instructions.map((s) => normalizeInstructionStep(s));
}

export function instructionStepText(step: RecipeInstructionStep): string {
  return normalizeInstructionStep(step).text;
}

/** Sum `durationSeconds` across instruction steps (excludes synthetic cook-mode steps). */
export function sumTimedInstructionSeconds(instructions: RecipeInstructionStep[] | undefined): number {
  let sum = 0;
  for (const s of normalizeInstructions(instructions)) {
    if (typeof s.durationSeconds === "number" && Number.isFinite(s.durationSeconds) && s.durationSeconds > 0) {
      sum += s.durationSeconds;
    }
  }
  return sum;
}
