// Service worker: receives the handoff from the recipe-app tab (via bridge.js), stashes the
// list, and opens the chosen Albertsons banner (Safeway / Vons / Pavilions — same platform) so
// safeway-content.js can pick it up on that domain.

const HANDOFF = "recipe-app:safeway-handoff";
const DEFAULT_BANNER = { id: "safeway", label: "Safeway", host: "www.safeway.com" };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== HANDOFF || !Array.isArray(msg.items)) return;
  // Banner comes from the app; fall back to Safeway. `host` decides which site we open and which
  // domain the content script activates on.
  const banner =
    msg.banner && typeof msg.banner.host === "string" ? msg.banner : DEFAULT_BANNER;
  chrome.storage.local.set(
    { pendingSafeway: { items: msg.items, banner, ts: Date.now() } },
    () => {
      chrome.tabs.create({ url: `https://${banner.host}/` });
      sendResponse({ ok: true });
    },
  );
  return true; // keep the message channel open for the async sendResponse
});
