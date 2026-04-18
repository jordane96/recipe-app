/**
 * Tracks which plan meals are in an active cook-mode session (sessionStorage).
 * Cleared when the user taps "It's ready!" or "Cancel" for that session.
 */

import { recipeCookModePath } from "./listTabSearch";

const STORAGE_KEY = "recipe-app-cook-progress-v1";

export const COOK_PROGRESS_CHANGED_EVENT = "recipe-app-cook-progress-changed";

export type CookProgressEntry = {
  recipeId: string;
  cookDate: string;
  /** Empty string when no planner slot ref */
  slotRef: string;
  /** Display name in cook-mode switcher */
  title: string;
};

function normalizeSlotRef(ref: string | null | undefined): string {
  return ref && ref.length > 0 ? ref : "";
}

function entryKey(e: CookProgressEntry): string {
  return `${e.recipeId}\x1e${e.cookDate}\x1e${e.slotRef}`;
}

/** Stable React key for a progress row */
export function cookProgressSessionKey(e: CookProgressEntry): string {
  return entryKey(e);
}

function readAll(): CookProgressEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: CookProgressEntry[] = [];
    for (const row of parsed) {
      if (
        row &&
        typeof row === "object" &&
        typeof (row as CookProgressEntry).recipeId === "string" &&
        typeof (row as CookProgressEntry).cookDate === "string" &&
        typeof (row as CookProgressEntry).slotRef === "string"
      ) {
        const r = row as CookProgressEntry;
        out.push({
          ...r,
          title: typeof r.title === "string" && r.title.trim() ? r.title : "Recipe",
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(entries: CookProgressEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (entries.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
    window.dispatchEvent(new Event(COOK_PROGRESS_CHANGED_EVENT));
  } catch {
    // quota / private mode
  }
}

export function getCookProgressSessions(): CookProgressEntry[] {
  return readAll();
}

export function cookProgressEntryHref(e: CookProgressEntry): string {
  const slot = e.slotRef.length > 0 ? e.slotRef : null;
  return recipeCookModePath(e.recipeId, e.cookDate, slot);
}

export type CookProgressBatchItem = {
  recipeId: string;
  cookDate: string;
  planSlotRef: string | null | undefined;
  title: string;
};

/** Add or update several sessions; one storage write and one progress event. */
export function addCookProgressSessionsBatch(items: CookProgressBatchItem[]): void {
  if (items.length === 0) {
    return;
  }
  const byKey = new Map<string, CookProgressEntry>();
  for (const e of readAll()) {
    byKey.set(entryKey(e), e);
  }
  let changed = false;
  for (const item of items) {
    const entry: CookProgressEntry = {
      recipeId: item.recipeId,
      cookDate: item.cookDate,
      slotRef: normalizeSlotRef(item.planSlotRef),
      title: (item.title && item.title.trim()) || "Recipe",
    };
    const k = entryKey(entry);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, entry);
      changed = true;
    } else if (existing.title !== entry.title) {
      byKey.set(k, { ...existing, title: entry.title });
      changed = true;
    }
  }
  if (changed) {
    writeAll([...byKey.values()]);
  }
}

export function addCookProgressSession(
  recipeId: string,
  cookDate: string,
  planSlotRef: string | null | undefined,
  title: string,
): void {
  const entry: CookProgressEntry = {
    recipeId,
    cookDate,
    slotRef: normalizeSlotRef(planSlotRef),
    title: (title && title.trim()) || "Recipe",
  };
  const k = entryKey(entry);
  const all = readAll();
  const i = all.findIndex((e) => entryKey(e) === k);
  if (i >= 0) {
    if (all[i].title === entry.title) {
      return;
    }
    all[i] = { ...all[i], title: entry.title };
    writeAll(all);
    return;
  }
  all.push(entry);
  writeAll(all);
}

export function removeCookProgressSession(
  recipeId: string,
  cookDate: string,
  planSlotRef: string | null | undefined,
): void {
  const k = entryKey({
    recipeId,
    cookDate,
    slotRef: normalizeSlotRef(planSlotRef),
  });
  const next = readAll().filter((e) => entryKey(e) !== k);
  writeAll(next);
}

export function isPlanMealCookInProgress(
  recipeId: string,
  cookDate: string,
  planSlotRef: string | null | undefined,
): boolean {
  const slot = normalizeSlotRef(planSlotRef);
  return readAll().some((e) => e.recipeId === recipeId && e.cookDate === cookDate && e.slotRef === slot);
}
