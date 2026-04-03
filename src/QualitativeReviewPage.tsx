import * as React from "react";
import { Link } from "react-router-dom";
import type { IngredientDef, IngredientsFile, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  collectQualitativeLines,
  type LineOverride,
  loadQualitativeOverrides,
  saveQualitativeOverrides,
} from "./qualitativeOverrides";

function unitsForIngredient(
  def: IngredientDef | undefined,
  unitsFile: IngredientsFile["units"],
): string[] {
  if (!def) {
    return [...unitsFile.volume, ...unitsFile.weight, ...unitsFile.count];
  }
  if (def.kind === "volume") {
    return unitsFile.volume;
  }
  if (def.kind === "weight") {
    return unitsFile.weight;
  }
  if (def.kind === "count") {
    return unitsFile.count;
  }
  return [...unitsFile.volume, ...unitsFile.weight, ...unitsFile.count];
}

function QualitativeRowEditor({
  rowKey,
  recipeId,
  recipeTitle,
  sectionName,
  displayLine,
  mergeHint,
  unitOptions,
  suggestedUnit,
  saved,
  onSave,
  onClear,
}: {
  rowKey: string;
  recipeId: string;
  recipeTitle: string;
  sectionName: string;
  displayLine: string;
  mergeHint: string | null;
  unitOptions: string[];
  suggestedUnit: string;
  saved: LineOverride | undefined;
  onSave: (key: string, amount: number, unit: string) => void;
  onClear: (key: string) => void;
}) {
  const [amt, setAmt] = React.useState(saved ? String(saved.amount) : "");
  const [unit, setUnit] = React.useState(saved?.unit ?? suggestedUnit);

  React.useEffect(() => {
    setAmt(saved ? String(saved.amount) : "");
    setUnit(saved?.unit ?? suggestedUnit);
  }, [rowKey, saved?.amount, saved?.unit, suggestedUnit]);

  const handleSave = () => {
    const trimmed = amt.trim();
    const u = unit.trim();
    if (trimmed === "" || u === "") {
      onClear(rowKey);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
      return;
    }
    onSave(rowKey, n, u);
  };

  return (
    <li className="qualitative-card">
      <div className="qualitative-card-head">
        <Link to={`/recipe/${recipeId}`} className="qualitative-recipe-title">
          {recipeTitle}
        </Link>
        <span className="muted qualitative-section">{sectionName}</span>
      </div>
      <p className="qualitative-current">{displayLine}</p>
      {mergeHint ? <p className="muted qualitative-hint">{mergeHint}</p> : null}
      <div className="qualitative-form">
        <label className="qualitative-label">
          Amount
          <input
            type="text"
            inputMode="decimal"
            className="qualitative-input"
            placeholder="e.g. 10"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
          />
        </label>
        <label className="qualitative-label">
          Unit
          <select
            className="qualitative-select"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          >
            <option value="">—</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-secondary qualitative-apply" onClick={handleSave}>
          Save
        </button>
        {saved ? (
          <button type="button" className="btn-ghost qualitative-row-clear" onClick={() => onClear(rowKey)}>
            Clear
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function QualitativeReviewPage({
  recipes,
  ingredients,
  units,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  units: IngredientsFile["units"];
}) {
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);
  const rows = React.useMemo(() => collectQualitativeLines(recipes), [recipes]);

  const [overrides, setOverrides] = React.useState<Record<string, LineOverride>>(
    () => loadQualitativeOverrides(),
  );
  const [onlyMissing, setOnlyMissing] = React.useState(true);

  const onSave = React.useCallback((key: string, amount: number, unit: string) => {
    setOverrides((prev) => {
      const next = { ...prev, [key]: { amount, unit } };
      saveQualitativeOverrides(next);
      return next;
    });
  }, []);

  const onClear = React.useCallback((key: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      saveQualitativeOverrides(next);
      return next;
    });
  }, []);

  const clearAll = React.useCallback(() => {
    if (
      window.confirm(
        "Clear all saved quantity overrides on this device? Recipe files are unchanged.",
      )
    ) {
      setOverrides(() => {
        saveQualitativeOverrides({});
        return {};
      });
    }
  }, []);

  const exportForRepo = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(overrides, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qualitative-overrides-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [overrides]);

  const filteredRows = onlyMissing
    ? rows.filter((r) => !overrides[r.key])
    : rows;

  const filledCount = rows.filter((r) => Boolean(overrides[r.key])).length;

  return (
    <>
      <div className="top-bar">
        <Link to="/" className="back-btn">
          ← Recipes
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.2rem" }}>
          Missing quantities
        </h1>
      </div>
      <p className="muted qualitative-intro">
        Lines with no amount in recipe data don’t merge on the combined shopping list. Add
        amount + unit here (saved in the browser for this device). To update the canonical
        recipe source: use <strong>Export for repo</strong>, then from{" "}
        <code>recipe-app</code> run{" "}
        <code>npm run data:apply-qualitative -- ../path/to/qualitative-overrides-export.json</code>{" "}
        and <code>npm run data:publish</code>. You can clear browser overrides after that.
      </p>
      <div className="qualitative-toolbar">
        <label className="qualitative-filter">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Show only unfilled
        </label>
        <span className="muted qualitative-count">
          {filledCount} / {rows.length} filled
        </span>
        <button type="button" className="btn-secondary qualitative-export" onClick={exportForRepo}>
          Export for repo
        </button>
        <button type="button" className="btn-ghost qualitative-clear" onClick={clearAll}>
          Clear all overrides
        </button>
      </div>
      {filteredRows.length === 0 ? (
        <p className="empty">
          {onlyMissing
            ? "Nothing left to fill (or no qualitative lines)."
            : "No qualitative lines in data."}
        </p>
      ) : (
        <ul className="qualitative-list">
          {filteredRows.map((row) => {
            const def = byId.get(row.line.ingredientId);
            const unitOptions = unitsForIngredient(def, units);
            const suggestedUnit = unitOptions[0] ?? "";
            const displayLine = formatIngredientLine(row.line, byId);
            const mergeHint =
              def?.kind === "other"
                ? "Kind “other” — still won’t merge numerically on the list."
                : null;
            return (
              <QualitativeRowEditor
                key={row.key}
                rowKey={row.key}
                recipeId={row.recipeId}
                recipeTitle={row.recipeTitle}
                sectionName={row.sectionName}
                displayLine={displayLine}
                mergeHint={mergeHint}
                unitOptions={unitOptions}
                suggestedUnit={suggestedUnit}
                saved={overrides[row.key]}
                onSave={onSave}
                onClear={onClear}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
