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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const [desireOpen, setDesireOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const effectiveOpen = isOpen || desireOpen;

  const selected = options.find((o) => o.id === valueId);
  const displayName = selected?.name ?? unknownLabel;

  React.useEffect(() => {
    if (!isOpen) {
      setDesireOpen(false);
    }
  }, [isOpen]);

  const prevIsOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      // Keep the current selection visible in the single input (same as AddIngredientLibraryCombobox).
      setQuery(displayName);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, displayName]);

  React.useLayoutEffect(() => {
    if (!effectiveOpen) {
      return;
    }
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [effectiveOpen]);

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

  const openPanel = () => {
    setQuery(displayName);
    setDesireOpen(true);
    onRequestOpen();
  };

  const closePanel = () => {
    setDesireOpen(false);
    onRequestClose();
  };

  const togglePanel = () => {
    if (effectiveOpen) {
      closePanel();
    } else {
      openPanel();
    }
  };

  const onKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && effectiveOpen) {
      e.preventDefault();
      closePanel();
      return;
    }
    if (e.key === "ArrowDown" && !effectiveOpen) {
      e.preventDefault();
      openPanel();
    }
  };

  const onKeyDownPanel = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`edit-recipe-ing-combo${effectiveOpen ? " edit-recipe-ing-combo--open" : ""}`}
    >
      <div className="edit-recipe-ing-combo-trigger-row">
        <input
          ref={inputRef}
          type="text"
          className="edit-recipe-ing-combo-trigger-input"
          aria-label={ariaLabel}
          aria-expanded={effectiveOpen}
          aria-haspopup="listbox"
          aria-controls={effectiveOpen ? listId : undefined}
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={!effectiveOpen ? "Search ingredients…" : undefined}
          value={effectiveOpen ? query : displayName}
          onChange={(e) => {
            if (!effectiveOpen) {
              openPanel();
            }
            setQuery(e.target.value);
          }}
          onFocus={() => {
            if (!effectiveOpen) {
              openPanel();
            }
          }}
          onKeyDown={onKeyDownInput}
        />
        <button
          type="button"
          className="edit-recipe-ing-combo-chevron-btn"
          aria-label={effectiveOpen ? "Close ingredient list" : "Open ingredient list"}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={togglePanel}
        >
          <span className="edit-recipe-ing-combo-chevron" aria-hidden>
            ▾
          </span>
        </button>
      </div>
      {effectiveOpen ? (
        <div
          className={`edit-recipe-ing-combo-panel edit-recipe-ing-combo-panel--no-search${onAddNew ? " edit-recipe-ing-combo-panel--with-footer" : ""}`}
          role="presentation"
          onKeyDown={onKeyDownPanel}
        >
          <ul id={listId} className="edit-recipe-ing-combo-list" role="listbox">
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
                    closePanel();
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
                  closePanel();
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
