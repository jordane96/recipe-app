import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INGREDIENTS, UNITS } from "./ingredientLibrary.mjs";
import { RECOMMENDED_SIDES } from "./recommendedSides.mjs";
import { SECTIONS } from "./recipeIngredientSections.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const legacyPath = join(root, "data/legacy-recipes-v1.json");
const legacy = JSON.parse(readFileSync(legacyPath, "utf8"));

const libIds = new Set(INGREDIENTS.map((i) => i.id));

for (const r of legacy.recipes) {
  if (!(r.id in SECTIONS)) {
    throw new Error(`recipeIngredientSections.mjs missing key: ${r.id}`);
  }
}

for (const [rid, secs] of Object.entries(SECTIONS)) {
  for (const sec of secs) {
    for (const line of sec.lines) {
      if (!libIds.has(line.ingredientId)) {
        throw new Error(`Unknown ingredientId "${line.ingredientId}" in ${rid}`);
      }
    }
  }
}

const legacyById = Object.fromEntries(legacy.recipes.map((r) => [r.id, r]));

for (const mainId of Object.keys(RECOMMENDED_SIDES)) {
  if (!(mainId in SECTIONS)) {
    throw new Error(`recommendedSides.mjs: unknown main recipe id "${mainId}"`);
  }
}

for (const [mainId, entries] of Object.entries(RECOMMENDED_SIDES)) {
  for (const e of entries) {
    const target = legacyById[e.recipeId];
    if (!target) {
      throw new Error(
        `recommendedSides.mjs: unknown side recipe id "${e.recipeId}" (from "${mainId}")`,
      );
    }
    if (target.course !== "side") {
      throw new Error(
        `recommendedSides.mjs: "${e.recipeId}" must have course "side" in legacy (referenced from "${mainId}")`,
      );
    }
  }
}

const recipes = legacy.recipes.map((r) => {
  const { sections: _s, ...rest } = r;
  const recommendedSides = RECOMMENDED_SIDES[r.id]
    ? structuredClone(RECOMMENDED_SIDES[r.id])
    : undefined;
  return {
    ...rest,
    ingredientSections: structuredClone(SECTIONS[r.id]),
    ...(recommendedSides ? { recommendedSides } : {}),
  };
});

writeFileSync(
  join(root, "public/ingredients.json"),
  JSON.stringify({ version: 1, units: UNITS, ingredients: INGREDIENTS }, null, 2),
);
writeFileSync(
  join(root, "public/recipes.json"),
  JSON.stringify({ version: 2, recipes }, null, 2),
);
console.log("Wrote public/ingredients.json and public/recipes.json (v2 + recommendedSides).");
