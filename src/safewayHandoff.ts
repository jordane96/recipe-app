/**
 * Hands the shopping list off to the "Recipe App → Safeway Cart" browser extension.
 *
 * Safeway has no public cart API and no account-link handshake (unlike Kroger), so the
 * app can't fill a Safeway cart from its own backend. Instead we publish the buy list and
 * a companion extension — running inside the user's own logged-in safeway.com session —
 * searches each item and adds the selections to the cart. See `safeway-extension/README.md`.
 *
 * "Publishing" here just means broadcasting the list on the page; if the extension isn't
 * installed nothing happens (and the UI falls back to a copyable list).
 */

export const SAFEWAY_HANDOFF_MESSAGE = "recipe-app:safeway-handoff";
/** Mirror of the broadcast, so the extension can also pull it on demand. */
export const SAFEWAY_HANDOFF_STORAGE_KEY = "recipe-app-safeway-handoff";

export type SafewayBannerId = "safeway" | "vons" | "pavilions";

/**
 * Albertsons banners the extension supports — all run the identical e-commerce platform, so the
 * same extension works on each; only the domain differs. `host` tells the extension which site to
 * open and activate on.
 */
export type SafewayBanner = { id: SafewayBannerId; label: string; host: string };

export const SAFEWAY_BANNERS: readonly SafewayBanner[] = [
  { id: "safeway", label: "Safeway", host: "www.safeway.com" },
  { id: "vons", label: "Vons", host: "www.vons.com" },
  { id: "pavilions", label: "Pavilions", host: "www.pavilions.com" },
];

/** Look up a banner by id; returns undefined for unknown/missing ids. */
export function bannerById(id: string | null | undefined): SafewayBanner | undefined {
  return SAFEWAY_BANNERS.find((b) => b.id === id);
}

export type SafewayHandoffItem = {
  /** Clean search term for Safeway's product search (e.g. "boneless chicken thighs"). */
  term: string;
  /** Original shopping-list line, for display in the extension panel. */
  label: string;
  /** Default cart quantity; the user adjusts per item in the extension. */
  qty: number;
  /** Distinct recipe prep notes (e.g. "chopped"), shown as subtext in the extension. */
  notes?: string[];
};

export type SafewayHandoffPayload = {
  type: typeof SAFEWAY_HANDOFF_MESSAGE;
  version: 1;
  items: SafewayHandoffItem[];
  /** Which banner (Safeway / Vons / Pavilions) to open and fill. */
  banner: SafewayBanner;
  ts: number;
};

/** True when the companion extension has announced itself on this page. */
export function isSafewayExtensionPresent(): boolean {
  return document.documentElement.getAttribute("data-safeway-ext") === "1";
}

/**
 * "present" — extension live; "stale" — extension was reloaded while this tab stayed open
 * (a page refresh reconnects it); "absent" — not installed.
 */
export function getSafewayExtensionStatus(): "present" | "stale" | "absent" {
  const v = document.documentElement.getAttribute("data-safeway-ext");
  if (v === "1") return "present";
  if (v === "stale") return "stale";
  return "absent";
}

/** Broadcast the list to the extension (and stash a copy it can pull on demand). */
export function publishSafewayHandoff(
  items: SafewayHandoffItem[],
  banner: SafewayBanner,
): SafewayHandoffPayload {
  const payload: SafewayHandoffPayload = {
    type: SAFEWAY_HANDOFF_MESSAGE,
    version: 1,
    items,
    banner,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(SAFEWAY_HANDOFF_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full / disabled — the postMessage below is the primary path */
  }
  try {
    window.postMessage(payload, window.location.origin);
  } catch {
    /* ignore */
  }
  return payload;
}
