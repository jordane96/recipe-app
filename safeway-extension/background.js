// Service worker: receives the handoff from the recipe-app tab (via bridge.js),
// stashes the list, and opens Safeway so safeway-content.js can pick it up.

const HANDOFF = "recipe-app:safeway-handoff";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== HANDOFF || !Array.isArray(msg.items)) return;
  chrome.storage.local.set(
    { pendingSafeway: { items: msg.items, ts: Date.now() } },
    () => {
      chrome.tabs.create({ url: "https://www.safeway.com/" });
      sendResponse({ ok: true });
    },
  );
  return true; // keep the message channel open for the async sendResponse
});
