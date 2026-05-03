import * as React from "react";
import type { IngredientDef } from "./types";

export type AddIngredientLibraryComboboxProps = {
  /** `htmlFor` on the field label — must match this trigger `id`. */
  id: string;
  options: IngredientDef[];
  /** Committed value for the trigger only (updated when you pick a row or click Add new). */
  search: string;
  onSearchChange: (value: string) => void;
  pickId: string | null;
  isOpen: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onSelectIngredient: (def: IngredientDef) => void;
  /** Clears catalog pick; parent should close measure/unit/category popovers if needed. */
  onAddNew: () => void;
  autoFocus?: boolean;
  "aria-label"?: string;
};

export function AddIngredientLibraryCombobox({
  id,
  options,
  search,
  onSearchChange,
  pickId,
  isOpen,
  onRequestOpen,
  onRequestClose,
  onSelectIngredient,
  onAddNew,
  autoFocus = false,
  "aria-label": ariaLabel = "Ingredient list",
}: AddIngredientLibraryComboboxProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  /** True until parent `isOpen` catches up — keeps one input usable in the same tick as focus. */
  const [desireOpen, setDesireOpen] = React.useState(false);
  /** Filter text while the list is shown (single field = trigger + filter). */
  const [panelQuery, setPanelQuery] = React.useState("");

  const effectiveOpen = isOpen || desireOpen;

  const selected = pickId ? options.find((o) => o.id === pickId) : undefined;
  const triggerText = selected?.name ?? (search.trim() ? search : "");
  const showPlaceholder = !triggerText;

  const filtered = React.useMemo(() => {
    const q = panelQuery.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter(
      (o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q),
    );
  }, [options, panelQuery]);

  React.useEffect(() => {
    if (!isOpen) {
      setDesireOpen(false);
    }
  }, [isOpen]);

  const prevIsOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setPanelQuery(search);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, search]);

  React.useLayoutEffect(() => {
    if (!effectiveOpen) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
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

  const openPanel = () => {
    setPanelQuery(search);
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
      className={`edit-recipe-ing-combo edit-recipe-modal-ing-combo${effectiveOpen ? " edit-recipe-ing-combo--open" : ""}`}
    >
      <div className="edit-recipe-ing-combo-trigger-row">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="edit-recipe-ing-combo-trigger-input"
          aria-label={ariaLabel}
          aria-expanded={effectiveOpen}
          aria-haspopup="listbox"
          aria-controls={effectiveOpen ? listId : undefined}
          role="combobox"
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={
            showPlaceholder && !effectiveOpen ? "Search library or add a new ingredient" : undefined
          }
          value={effectiveOpen ? panelQuery : triggerText}
          onChange={(e) => {
            if (!effectiveOpen) {
              openPanel();
            }
            setPanelQuery(e.target.value);
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
          className="edit-recipe-ing-combo-panel edit-recipe-modal-ing-combo-panel edit-recipe-ing-combo-panel--no-search"
          role="presentation"
          onKeyDown={onKeyDownPanel}
        >
          <ul id={listId} className="edit-recipe-ing-combo-list" role="listbox" aria-label="Matching ingredients">
            {filtered.slice(0, 100).map((o) => (
              <li key={o.id} className="edit-recipe-ing-combo-li" role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === pickId}
                  className={`edit-recipe-ing-combo-option${o.id === pickId ? " edit-recipe-ing-combo-option--current" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectIngredient(o);
                    closePanel();
                  }}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
          {filtered.length === 0 ? <div className="edit-recipe-ing-combo-empty">No matches</div> : null}
          <div className="edit-recipe-modal-ing-combo-footer">
            <span className="edit-recipe-modal-ing-combo-footer-hint">
              Don&apos;t see what you&apos;re looking for?
            </span>
            <button
              type="button"
              className="edit-recipe-modal-ing-combo-add-new"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSearchChange(panelQuery);
                onAddNew();
                closePanel();
              }}
            >
              Add new
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
