/**
 * Best-effort mobile detection — used to tailor the Safeway ordering guidance (the browser
 * extension is desktop-Chrome-only; phones get the screenshot → "Import from List" flow instead).
 * This is for UI guidance, not security, so a good guess is fine.
 *
 * Note: if the Safeway extension is *detected*, the device is definitively desktop Chrome — only
 * call this when the extension is absent.
 */
/**
 * True only on iOS Safari. Narrower than isLikelyMobile() on purpose: it gates guidance that is
 * specific to Safari's Share -> View More -> Add to Home Screen flow, which does not exist on
 * Android, on desktop, or in the other iOS browsers (which are WebKit but have their own menus).
 * Best-effort UI guidance, not security.
 */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const maxTouchPoints = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  // iPadOS 13+ reports a desktop Mac UA, so fall back to the touch-point check.
  const isIos =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (!isIos) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Mercury/i.test(ua);
}

export function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  // 1. Client Hints (Chromium) — the most reliable signal when available.
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
  // 2. Touch-primary device (phones + tablets, incl. iPadOS which fakes a desktop UA).
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return true;
  // 3. UA-string fallback (Safari / Firefox, which lack userAgentData).
  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}
