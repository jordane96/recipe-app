import * as React from "react";
import type { IngredientDef } from "./types";

export type IngredientSearchComboboxProps = {
  valueId: string;
  options: IngredientDef[];
  /** Shown on the trigger when `valueId` is not in `options`. */
  unknownLabel: string;
  isOpen: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onSelect: (id: string) => void;
  /** Opens add-ingredient flow (e.g. modal) for a new or custom item; parent should close the panel first. */
  onAddNew?: () => void;
  "aria-label"?: string;
};

export function IngredientSearchCombobox({
  valueId,
  options,
  unknownLabel,
  isOpen,
  onRequestOpen,
  onRequestClose,
  onSelect,
  onAddNew,
  "aria-label": ariaLabel,
}: IngredientSearchComboboxProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.id === valueId);
  const displayName = selected?.name ?? unknownLabel;

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    setQuery("");
    const id = requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) {
        return;
      }
      onRequestClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [isOpen, onRequestClose]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q),
    );
  }, [options, query]);

  const filteredList = React.useMemo(() => filtered.slice(0, 100), [filtered]);

  const onTriggerClick = () => {
    if (isOpen) {
      onRequestClose();
    } else {
      onRequestOpen();
    }
  };

  const onKeyDownTrigger = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        onRequestOpen();
      }
    }
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      onRequestClose();
    }
  };

  const onKeyDownPanel = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onRequestClose();
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`edit-recipe-ing-combo${isOpen ? " edit-recipe-ing-combo--open" : ""}`}
    >
      <button
        type="button"
        className="edit-recipe-ing-combo-trigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={onTriggerClick}
        onKeyDown={onKeyDownTrigger}
      >
        <span className="edit-recipe-ing-combo-value">{displayName}</span>
        <span className="edit-recipe-ing-combo-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          className={`edit-recipe-ing-combo-panel${onAddNew ? " edit-recipe-ing-combo-panel--with-footer" : ""}`}
          role="presentation"
          onKeyDown={onKeyDownPanel}
        >
          <input
            ref={searchRef}
            type="search"
            className="edit-recipe-ing-combo-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients…"
            aria-label="Filter ingredients"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <ul className="edit-recipe-ing-combo-list" role="listbox">
            {filteredList.map((o) => (
              <li key={o.id} className="edit-recipe-ing-combo-li" role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === valueId}
                  className={`edit-recipe-ing-combo-option${o.id === valueId ? " edit-recipe-ing-combo-option--current" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(o.id);
                    onRequestClose();
                  }}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? (
            <div className="edit-recipe-ing-combo-empty">No matches</div>
          ) : null}
          {onAddNew ? (
            <div className="edit-recipe-ing-combo-panel-footer">
              <span className="edit-recipe-ing-combo-panel-footer-hint">
                Don&apos;t see what you&apos;re looking for?
              </span>
              <button
                type="button"
                className="edit-recipe-ing-combo-panel-footer-add"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onRequestClose();
                  onAddNew();
                }}
              >
                Add new
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
