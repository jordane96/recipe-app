/**
 * Which staples the user has told us about.
 *
 * Two separate sets, both keyed by ingredient id:
 *
 * - **alwaysHave** — "I always have this". Permanent; the ingredient never shows on the
 *   shopping list again (not even in the staples tray) until it's reset.
 * - **needThisTime** — pulled back onto the list for the current shop (you ran out of olive
 *   oil this week). Cleared when the list is cleared, since the shop is over.
 *
 * Local-only, like the rest of the shopping state — see the "household" item on the roadmap
 * for when this needs to move server-side.
 */

const ALWAYS_HAVE_KEY = "recipe-app-pantry-always-have-v1";
const NEED_THIS_TIME_KEY = "recipe-app-pantry-need-this-time-v1";

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) {
      return [];
    }
    return p.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]): void {
  localStorage.setItem(key, JSON.stringify(ids));
}

export function loadAlwaysHave(): string[] {
  return readIds(ALWAYS_HAVE_KEY);
}

export function saveAlwaysHave(ids: string[]): void {
  writeIds(ALWAYS_HAVE_KEY, ids);
}

export function loadNeedThisTime(): string[] {
  return readIds(NEED_THIS_TIME_KEY);
}

export function saveNeedThisTime(ids: string[]): void {
  writeIds(NEED_THIS_TIME_KEY, ids);
}
