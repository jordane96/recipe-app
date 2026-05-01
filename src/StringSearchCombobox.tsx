import * as React from "react";

export type StringSearchComboboxProps = {
  value: string;
  options: string[];
  isOpen: boolean;
  onRequestOpen: () => void;
  onRequestClose: () => void;
  onSelect: (next: string) => void;
  /** When `value` is not in `options`, shown on the trigger. */
  fallbackLabel?: string;
  "aria-label"?: string;
  disabled?: boolean;
};

/**
 * Dropdown list that always opens **below** the trigger (avoids native `<select>` flip).
 * Reuses `.edit-recipe-ing-combo*` styles from the edit recipe screen.
 */
export function StringSearchCombobox({
  value,
  options,
  isOpen,
  onRequestOpen,
  onRequestClose,
  onSelect,
  fallbackLabel,
  "aria-label": ariaLabel,
  disabled = false,
}: StringSearchComboboxProps) {
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const inList = options.includes(value);
  const display = inList ? value : (fallbackLabel ?? (value || "—"));

  React.useEffect(() => {
    if (!isOpen || disabled) {
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
  }, [isOpen, disabled, onRequestClose]);

  if (disabled) {
    return (
      <div className="edit-recipe-ing-combo edit-recipe-ing-combo--disabled">
        <div
          className="edit-recipe-ing-combo-trigger"
          aria-label={ariaLabel}
          aria-disabled="true"
        >
          <span className="edit-recipe-ing-combo-value">{display}</span>
          <span className="edit-recipe-ing-combo-chevron" aria-hidden>
            ▾
          </span>
        </div>
      </div>
    );
  }

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
        <span className="edit-recipe-ing-combo-value">{display}</span>
        <span className="edit-recipe-ing-combo-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          className="edit-recipe-ing-combo-panel edit-recipe-ing-combo-panel--no-search"
          role="presentation"
          onKeyDown={onKeyDownPanel}
        >
          <ul className="edit-recipe-ing-combo-list" role="listbox">
            {options.map((o) => (
              <li key={o} className="edit-recipe-ing-combo-li" role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={o === value}
                  className={`edit-recipe-ing-combo-option${o === value ? " edit-recipe-ing-combo-option--current" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(o);
                    onRequestClose();
                  }}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
          {options.length === 0 ? (
            <div className="edit-recipe-ing-combo-empty">No units</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
