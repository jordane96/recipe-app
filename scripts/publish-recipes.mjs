/**
 * Publishes `public/ingredients.json` and `public/recipes.json`.
 *
 * Canonical recipe source: `data/recipes.v2.json` (version 2, full Recipe shape).
 * Legacy v1 + SECTIONS merge is only used by `migrate-legacy-to-recipes-v2.mjs`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INGREDIENTS, UNITS } from "./ingredientLibrary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const sourcePath = join(root, "data/recipes.v2.json");

const bundle = JSON.parse(readFileSync(sourcePath, "utf8"));

if (bundle.version !== 2 || !Array.isArray(bundle.recipes)) {
  throw new Error(`${sourcePath} must be { version: 2, recipes: Recipe[] }`);
}

const libIds = new Set(INGREDIENTS.map((i) => i.id));
const seenIds = new Set();

for (const r of bundle.recipes) {
  if (typeof r.id !== "string" || !r.id.trim()) {
    throw new Error("Every recipe must have a non-empty string id");
  }
  if (seenIds.has(r.id)) {
    throw new Error(`Duplicate recipe id: ${r.id}`);
  }
  seenIds.add(r.id);

  if (!Array.isArray(r.ingredientSections)) {
    throw new Error(`Recipe "${r.id}" must have ingredientSections[]`);
  }
  for (const sec of r.ingredientSections) {
    if (!Array.isArray(sec.lines)) {
      throw new Error(`Recipe "${r.id}" section "${sec.name}" must have lines[]`);
    }
    for (const line of sec.lines) {
      if (!libIds.has(line.ingredientId)) {
        throw new Error(`Unknown ingredientId "${line.ingredientId}" in recipe "${r.id}"`);
      }
    }
  }

  for (const ref of r.recommendedSides ?? []) {
    if (typeof ref.recipeId !== "string" || !ref.recipeId.trim()) {
      throw new Error(`Recipe "${r.id}" has recommendedSides entry without recipeId`);
    }
  }
}

const byId = Object.fromEntries(bundle.recipes.map((r) => [r.id, r]));

for (const r of bundle.recipes) {
  for (const ref of r.recommendedSides ?? []) {
    const target = byId[ref.recipeId];
    if (!target) {
      throw new Error(`recommendedSides on "${r.id}": unknown recipeId "${ref.recipeId}"`);
    }
    if (target.course !== "side") {
      throw new Error(
        `recommendedSides on "${r.id}": "${ref.recipeId}" must have course "side" (got ${JSON.stringify(target.course)})`,
      );
    }
  }
}

writeFileSync(
  join(root, "public/ingredients.json"),
  JSON.stringify({ version: 1, units: UNITS, ingredients: INGREDIENTS }, null, 2),
);
writeFileSync(
  join(root, "public/recipes.json"),
  JSON.stringify({ version: 2, recipes: structuredClone(bundle.recipes) }, null, 2),
);
console.log(`Wrote public/ingredients.json and public/recipes.json from ${sourcePath} (${bundle.recipes.length} recipes).`);
