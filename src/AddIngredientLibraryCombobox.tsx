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
  const searchRef = React.useRef<HTMLInputElement>(null);
  /** Draft filter while the panel is open — does not update the trigger until commit. */
  const [panelQuery, setPanelQuery] = React.useState("");

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

  const prevIsOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setPanelQuery(search);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, search]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
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
      className={`edit-recipe-ing-combo edit-recipe-modal-ing-combo${isOpen ? " edit-recipe-ing-combo--open" : ""}`}
    >
      <button
        id={id}
        type="button"
        className="edit-recipe-ing-combo-trigger"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        autoFocus={autoFocus}
        onClick={onTriggerClick}
        onKeyDown={onKeyDownTrigger}
      >
        <span
          className={`edit-recipe-ing-combo-value${showPlaceholder ? " edit-recipe-ing-combo-value--placeholder" : ""}`}
        >
          {showPlaceholder ? "Search library or add a new ingredient" : triggerText}
        </span>
        <span className="edit-recipe-ing-combo-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          className="edit-recipe-ing-combo-panel edit-recipe-modal-ing-combo-panel"
          role="presentation"
          onKeyDown={onKeyDownPanel}
        >
          <input
            ref={searchRef}
            type="search"
            className="edit-recipe-ing-combo-search"
            value={panelQuery}
            onChange={(e) => setPanelQuery(e.target.value)}
            placeholder="Search ingredients…"
            aria-label="Filter ingredient list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <ul className="edit-recipe-ing-combo-list" role="listbox" aria-label="Matching ingredients">
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
                    onRequestClose();
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
                onRequestClose();
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
