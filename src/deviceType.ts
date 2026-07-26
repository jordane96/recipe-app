/**
 * Best-effort mobile detection — used to tailor the Safeway ordering guidance (the browser
 * extension is desktop-Chrome-only; phones get the screenshot → "Import from List" flow instead).
 * This is for UI guidance, not security, so a good guess is fine.
 *
 * Note: if the Safeway extension is *detected*, the device is definitively desktop Chrome — only
 * call this when the extension is absent.
 */
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
