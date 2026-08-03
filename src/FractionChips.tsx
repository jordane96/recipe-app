/**
 * Tap-to-insert fractions for quantity fields.
 *
 * The amount inputs are `inputMode="decimal"`, which on iOS is a numeric pad with no `/` key and
 * no fraction glyphs — so on a phone there is literally no way to type ⅔, and people fall back to
 * `.666`. `parseQuantity` understands typed fractions for desktop users; this strip is how the
 * same thing gets entered by thumb.
 */

/** Offered on the strip. The full set `parseQuantity` understands is wider (⅙, ⅜, ⅝, ⅚, ⅞). */
export const FRACTION_CHIPS = ["⅛", "¼", "⅓", "½", "⅔", "¾"] as const;

/** Every glyph that may already be sitting at the end of the field, for strip/toggle detection. */
const TRAILING_GLYPH = /\s*[⅛⅙¼⅓⅜½⅝⅔¾⅚⅞]\s*$/u;

/**
 * The field's new text after tapping `glyph`. Tapping the fraction already showing removes it, so
 * the same chip is both add and undo; otherwise the fraction replaces whatever fractional part is
 * there and keeps the whole number ("1½" + ¼ → "1¼", "2" + ½ → "2½", "" + ⅔ → "⅔").
 */
export function applyFractionChip(current: string, glyph: string): string {
  const s = current.trim();
  const stripped = s.replace(TRAILING_GLYPH, "").trim();
  if (s !== stripped && s.slice(stripped.length).trim() === glyph) {
    return stripped;
  }
  if (stripped === "") {
    return glyph;
  }
  const whole = Math.floor(Number.parseFloat(stripped));
  if (!Number.isFinite(whole) || whole <= 0) {
    return glyph;
  }
  return `${whole}${glyph}`;
}

export function FractionChips({
  value,
  onChange,
  label = "Insert a fraction",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  return (
    <div className="fraction-chips" role="group" aria-label={label}>
      {FRACTION_CHIPS.map((glyph) => {
        const active = value.trim().endsWith(glyph);
        return (
          <button
            key={glyph}
            type="button"
            className={`fraction-chip${active ? " fraction-chip--active" : ""}`}
            aria-pressed={active}
            aria-label={`${glyph} — ${FRACTION_NAMES[glyph]}`}
            // Keep focus in the input: without this the pointer-down blurs the field, which
            // commits the amount and unmounts this strip before the click ever lands.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onChange(applyFractionChip(value, glyph))}
          >
            {glyph}
          </button>
        );
      })}
    </div>
  );
}

const FRACTION_NAMES: Record<(typeof FRACTION_CHIPS)[number], string> = {
  "⅛": "one eighth",
  "¼": "one quarter",
  "⅓": "one third",
  "½": "one half",
  "⅔": "two thirds",
  "¾": "three quarters",
};
