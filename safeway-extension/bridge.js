// Runs on the recipe-app page. Relays the app's "send to Safeway" broadcast to the
// extension's service worker, and announces the extension's presence to the app so the
// UI can show "✓ extension detected".

const HANDOFF = "recipe-app:safeway-handoff";

// Let the recipe app know the extension is installed.
try {
  document.documentElement.setAttribute("data-safeway-ext", "1");
} catch (e) {
  /* ignore */
}

window.addEventListener("message", (event) => {
  // Only trust messages this page posted to itself.
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== HANDOFF || !Array.isArray(data.items)) return;

  const items = data.items
    .filter((it) => it && typeof it.term === "string" && it.term.trim())
    .map((it) => ({
      term: String(it.term).trim(),
      label: typeof it.label === "string" ? it.label : String(it.term),
      qty: Number.isFinite(it.qty) && it.qty > 0 ? Math.floor(it.qty) : 1,
      notes: Array.isArray(it.notes)
        ? it.notes.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim())
        : [],
    }));
  if (items.length === 0) return;

  // Chosen banner (Safeway / Vons / Pavilions), if the app sent one.
  const banner =
    data.banner && typeof data.banner.host === "string"
      ? { id: String(data.banner.id || ""), label: String(data.banner.label || ""), host: String(data.banner.host) }
      : undefined;

  // If the extension was reloaded while this page stayed open, this content script's
  // chrome.runtime handle is stale ("Extension context invalidated"). Guard so it fails
  // quietly with a hint instead of throwing, and flag the app so it can prompt a refresh.
  try {
    if (!chrome.runtime || !chrome.runtime.id) throw new Error("context invalidated");
    chrome.runtime.sendMessage({ type: HANDOFF, items, banner }, () => void chrome.runtime.lastError);
  } catch (e) {
    console.warn(
      "[Safeway ext] Extension was reloaded — refresh this page to reconnect.",
      e,
    );
    try {
      document.documentElement.setAttribute("data-safeway-ext", "stale");
    } catch (_) {
      /* ignore */
    }
  }
});
