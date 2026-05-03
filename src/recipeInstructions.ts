import type { RecipeInstructionStep } from "./ingredientTypes";

export type NormalizedInstructionStep = {
  text: string;
  durationSeconds?: number;
  stepIngredients?: string[];
  note?: string;
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
  // Keep note string as stored (no trim) so edit UIs can show trailing/leading spaces;
  // use trim only to decide whether the note is present vs whitespace-only.
  const noteStr = typeof step.note === "string" ? step.note : "";
  const base: NormalizedInstructionStep = { text };
  if (durationSeconds != null) {
    base.durationSeconds = durationSeconds;
  }
  if (stepIngredients != null) {
    base.stepIngredients = stepIngredients;
  }
  if (noteStr.trim().length > 0) {
    base.note = noteStr;
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

/** Primary step line only — recipe list search uses this, not `note`. */
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
