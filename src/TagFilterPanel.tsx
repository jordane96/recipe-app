import * as React from "react";
import { groupTagsByFacet, tagLabel } from "./tagFacets";

/**
 * Two-level tag filter, shared by /recipes and /recipes/discover.
 *
 * Level one is a row of categories; level two is that category's values, revealed on tap and
 * collapsed by default. With ~50 tags in the vocabulary a flat list would fill the screen before
 * a single recipe was visible, so nothing is expanded until asked for.
 *
 * Selections survive collapsing — each category shows a count of what is active inside it, so the
 * filter state is never hidden by the thing that hides the chips.
 */
export function TagFilterPanel({
  id,
  tags,
  selectedTags,
  onToggleTag,
  onClear,
}: {
  id: string;
  tags: readonly string[];
  selectedTags: ReadonlySet<string>;
  onToggleTag: (tag: string) => void;
  onClear: () => void;
}) {
  const [openFacet, setOpenFacet] = React.useState<string | null>(null);
  const groups = React.useMemo(() => groupTagsByFacet(tags), [tags]);

  return (
    <div id={id} className="tag-facets" role="group" aria-label="Filter recipes by tag">
      <div className="tag-facet-cats">
        <button
          type="button"
          className="tag-facet-cat"
          data-on={selectedTags.size === 0}
          onClick={() => {
            setOpenFacet(null);
            onClear();
          }}
        >
          All
        </button>
        {groups.map((group) => {
          const activeCount = group.values.filter((v) => selectedTags.has(v)).length;
          const open = openFacet === group.key;
          return (
            <button
              key={group.key}
              type="button"
              className="tag-facet-cat"
              data-open={open}
              data-active={activeCount > 0}
              aria-expanded={open}
              aria-controls={`${id}-${group.key}`}
              onClick={() => setOpenFacet(open ? null : group.key)}
            >
              {group.label}
              {activeCount > 0 ? <span className="tag-facet-cat-count">{activeCount}</span> : null}
              <span className="tag-facet-cat-caret" aria-hidden>
                {open ? "▾" : "▸"}
              </span>
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <div
          key={group.key}
          id={`${id}-${group.key}`}
          className="tag-row tag-facet-values"
          hidden={openFacet !== group.key}
        >
          {group.values.map((t) => {
            const on = selectedTags.has(t);
            return (
              <button
                key={t}
                type="button"
                className="tag-chip"
                data-on={on}
                aria-pressed={on}
                onClick={() => onToggleTag(t)}
              >
                {tagLabel(t)}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
