import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { INGREDIENTS, UNITS } from "./ingredientLibrary.mjs";
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

const recipes = legacy.recipes.map((r) => {
  const { sections: _s, ...rest } = r;
  return { ...rest, ingredientSections: structuredClone(SECTIONS[r.id]) };
});

writeFileSync(
  join(root, "public/ingredients.json"),
  JSON.stringify({ version: 1, units: UNITS, ingredients: INGREDIENTS }, null, 2),
);
writeFileSync(
  join(root, "public/recipes.json"),
  JSON.stringify({ version: 2, recipes }, null, 2),
);
console.log("Wrote public/ingredients.json and public/recipes.json (v2).");
