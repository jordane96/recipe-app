import * as React from "react";

/**
 * Hold a screen wake lock while `active` is true so the device doesn't sleep — used during
 * cook mode so the recipe stays on screen and step timers keep ticking in the foreground.
 *
 * Notes on the Wake Lock API:
 * - The browser auto-releases the lock whenever the page is hidden (app switch, screen lock),
 *   so we re-acquire on `visibilitychange` once the page is visible again.
 * - Feature-detected: older Safari (< iOS 16.4) has no `navigator.wakeLock`; we no-op there.
 * - `request()` can reject (low-power mode, permissions) — swallowed, also a no-op.
 */
export function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;

    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
      } catch {
        // Rejected (low battery / permissions) — silently no-op.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
