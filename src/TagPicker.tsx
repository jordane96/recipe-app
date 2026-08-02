import * as React from "react";
import { EXTENSIBLE_FACETS, TAG_FACETS, groupTagsByFacet, tagLabel } from "./tagFacets";

/**
 * Faceted tag editor. Deliberately mirrors the filter row on /recipes — same chips, same facet
 * labels, same capitalised display over slugged storage — so selecting tags and filtering by them
 * feel like the same vocabulary rather than two systems.
 *
 * `suggestions` should be every tag already in use across the user's recipes, so adding a tag
 * offers what exists before inventing something new. That is the main defence against a fresh
 * crop of near-duplicates now that custom values are allowed.
 */
export function TagPicker({
  value,
  onChange,
  suggestions = [],
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  suggestions?: readonly string[];
}) {
  const [draft, setDraft] = React.useState("");
  const [facet, setFacet] = React.useState<string>("cuisine");
  const [error, setError] = React.useState<string | null>(null);
  const selected = React.useMemo(() => new Set(value), [value]);

  /** Built-in vocabulary plus anything already on this recipe, so custom tags stay visible. */
  const groups = React.useMemo(() => {
    const universe = new Set<string>(value);
    for (const def of TAG_FACETS) {
      for (const v of def.values) universe.add(v);
    }
    return groupTagsByFacet([...universe]);
  }, [value]);

  const toggle = React.useCallback(
    (tag: string) => {
      const next = new Set(value);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      onChange([...next]);
    },
    [value, onChange],
  );

  /** Mirrors normalizeTag() in api/_tags.js — same shape rules, so the client can't offer to save
   *  something the server would reject or silently rewrite. */
  const normalize = (raw: string): string | null => {
    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 -]/g, "")
      .replace(/^-+|-+$/g, "");
    if (!cleaned) return null;
    const slug = cleaned.replace(/ /g, "-").replace(/-{2,}/g, "-");
    return /^[a-z0-9][a-z0-9-]{1,23}$/.test(slug) ? slug : null;
  };

  const addDraft = React.useCallback(() => {
    const slug = normalize(draft);
    if (!slug) {
      setError("Use 2–24 letters or numbers.");
      return;
    }
    // A built-in value keeps its bare form regardless of the chosen category — "italian" is
    // already a cuisine, so prefixing it would fork the vocabulary.
    const isBuiltIn = TAG_FACETS.some((f) => (f.values as readonly string[]).includes(slug));
    const tag = isBuiltIn ? slug : `${facet}:${slug}`;
    if (selected.has(tag)) {
      setError(`“${tagLabel(tag)}” is already on this recipe.`);
      return;
    }
    onChange([...value, tag]);
    setDraft("");
    setError(null);
  }, [draft, facet, selected, value, onChange]);

  const unused = React.useMemo(
    () => suggestions.filter((s) => !selected.has(s)).sort((a, b) => a.localeCompare(b)),
    [suggestions, selected],
  );

  return (
    <div className="tag-picker">
      {groups.map((group) => (
        <div className="tag-facet-row" key={group.key}>
          <span className="tag-facet-label" id={`tagpick-${group.key}`}>
            {group.label}
          </span>
          <div className="tag-row" role="group" aria-labelledby={`tagpick-${group.key}`}>
            {group.values.map((t) => {
              const on = selected.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  className="tag-chip"
                  data-on={on}
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                >
                  {tagLabel(t)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="tag-facet-row tag-picker-add-row">
        <label className="tag-facet-label" htmlFor="tag-picker-new">
          Add a tag
        </label>
        <div className="tag-picker-add">
          <select
            className="tag-picker-facet"
            value={facet}
            onChange={(e) => setFacet(e.target.value)}
            aria-label="Category for the new tag"
          >
            {EXTENSIBLE_FACETS.map((key) => {
              const def = TAG_FACETS.find((f) => f.key === key);
              return (
                <option key={key} value={key}>
                  {def ? def.label : key}
                </option>
              );
            })}
          </select>
          <input
            id="tag-picker-new"
            className="tag-picker-input"
            type="text"
            list="tag-picker-suggestions"
            placeholder="Thai"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
          />
          <datalist id="tag-picker-suggestions">
            {unused.map((s) => (
              <option key={s} value={tagLabel(s)} />
            ))}
          </datalist>
          <button
            type="button"
            className="btn-secondary tag-picker-add-btn"
            onClick={addDraft}
            disabled={!draft.trim()}
          >
            Add
          </button>
        </div>
      </div>
      {error ? (
        <p className="tag-picker-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
