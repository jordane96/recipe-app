// Runs on safeway.com. When the recipe app has sent a list, shows a launcher; the panel
// searches each item (in hidden same-origin iframes, so the page you're on never navigates),
// lets you review/switch products Kroger-style, then adds everything in one cart call.
//
// Data sources reverse-engineered from the logged-in site:
//   • search results: <product-item-al-v2> cards, product id in the product-details link
//   • cart add: POST /abs/pub/erums/cartservice/api/v2/cart/items  (see addToCart)
//   • fulfillment params (store/zip/service): localStorage "abCart"

(() => {
  const MAX_OPTIONS = 12;
  const SEARCH_CONCURRENCY = 3;
  const SEARCH_TIMEOUT_MS = 15000;

  let state = null; // { items: [{ term, label, qty, options, selectedIndex, removed }] }
  let rootEl = null;
  let currentTs = null; // handoff id, so cached matches are tied to the right list
  let bannerLabel = "Safeway"; // Safeway / Vons / Pavilions — set from the handoff banner

  /** True if this page is the banner (host) the user chose for this handoff. */
  function hostMatches(host) {
    const h = String(host || "").toLowerCase();
    const cur = location.hostname.toLowerCase();
    return cur === h || `www.${cur}` === h || cur === h.replace(/^www\./, "");
  }
  let reviewScroll = 0; // remembered scroll of the review list, so re-renders don't jump to top

  /** Run fn once document.body exists (the content script may run at document_start). */
  function onBodyReady(fn) {
    if (document.body) return fn();
    document.addEventListener("DOMContentLoaded", () => fn(), { once: true });
  }

  /**
   * Persist matched results + the user's edits so a page reload / reopen is instant instead of
   * re-searching every item. Keyed to the handoff id so a new list doesn't reuse stale matches.
   */
  function saveState() {
    try {
      if (!extAlive() || !state || currentTs == null) return;
      chrome.storage.local.set({ swxMatches: { ts: currentTs, items: state.items } });
    } catch (e) {
      /* stale context — caching is best-effort */
    }
  }

  function clearSavedState() {
    try {
      if (extAlive()) chrome.storage.local.remove(["pendingSafeway", "swxMatches"]);
    } catch (e) {
      /* ignore */
    }
  }

  /** True while our extension context is alive (false after the extension is reloaded). */
  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // --- inject the main-world cart poster ------------------------------------
  try {
    const injected = document.createElement("script");
    injected.src = chrome.runtime.getURL("cart-inject.js");
    (document.head || document.documentElement).appendChild(injected);
    injected.remove();
  } catch (e) {
    // Stale context (extension reloaded while this tab was open) — a refresh fixes it.
    console.warn("[Safeway ext] Reloaded — refresh this Safeway tab to reconnect.", e);
    return;
  }

  // In subframes (our hidden search / cart-priming iframes, or any Safeway iframe) we only want
  // the injected cart-inject sniffer above — never the launcher/panel. Stop here.
  if (window.top !== window.self) return;

  // --- data helpers ---------------------------------------------------------

  /**
   * Read the store/zip/service context for the cart POST. The selected store persists in
   * `abStoreAddress` even when the cart/session (`abCart`) is empty, so prefer that; fall back
   * to `abCart` for the live service type. Returns null only when no store is selected at all.
   */
  function fulfillment() {
    let store = {};
    let cart = {};
    try {
      store = JSON.parse(localStorage.getItem("abStoreAddress") || "{}") || {};
    } catch (e) {
      /* ignore */
    }
    try {
      cart = JSON.parse(localStorage.getItem("abCart") || "{}") || {};
    } catch (e) {
      /* ignore */
    }
    const storeId = cart.storeId || store.storeId;
    if (!storeId) return null;
    return {
      storeId: String(storeId),
      serviceType: cart.serviceType || "Delivery",
      zipCode: cart.zipCode || store.storeZipcode || "",
      cartCategory: cart.cartCategory || "1P",
    };
  }

  /** Pull the top product options out of a rendered search-results document. */
  function scrapeCards(doc, max) {
    const cards = doc.querySelectorAll("product-item-al-v2, .pc-grid-prdItem");
    const out = [];
    const seen = new Set();
    for (const card of cards) {
      const link = card.querySelector('a[href*="product-details"]');
      if (!link) continue;
      const m = (link.getAttribute("href") || "").match(/product-details\.(\d+)\.html/);
      if (!m || seen.has(m[1])) continue;
      // Skip hidden placeholder tiles Safeway keeps in the DOM (display:none / zero-size).
      // Reading them scrambled the order — e.g. it surfaced "Roasted Garlic Sauce" above the
      // real fresh "Garlic" the shopper sees first. Visible-only = Safeway's actual Best Match.
      const cs = (doc.defaultView || window).getComputedStyle(card);
      if (cs.display === "none" || cs.visibility === "hidden" || card.getBoundingClientRect().width === 0) {
        continue;
      }
      const img = card.querySelector("img");
      const name = (img && img.getAttribute("alt")) || (link.textContent || "").trim();
      const image = img ? img.getAttribute("src") || img.getAttribute("data-src") || "" : "";
      const text = (card.innerText || "").replace(/\s+/g, " ");
      const priceMatch = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : null;
      const sizeMatch = name.match(/-\s*([\d.]+\s*(?:oz|lb|ct|ea|g|kg|ml|l|pk|pack|count)\b.*)$/i);
      out.push({ itemId: m[1], name, image, price, size: sizeMatch ? sizeMatch[1].trim() : null });
      seen.add(m[1]);
      if (out.length >= max) break;
    }
    return out;
  }

  // On a first/cold search Safeway can inject a promoted product as the top result that isn't in
  // warm/repeat results (e.g. "asparagus" → "Signature Select Mushrooms"; "olive oil" → "Truff
  // Black Truffle Oil"). It's not flagged sponsored, so we can't detect it directly. Conservative
  // fix: order by how many of the ingredient's words the product name matches (coverage), keeping
  // Safeway's own order within each tier. So "olive oil" (matches olive+oil) beats the injected
  // "truffle oil" (matches only oil), which beats unrelated ads (matches nothing). Nothing is
  // dropped — weaker matches just fall toward the end of "See other options".
  const REL_STOP = new Set(["in", "of", "with", "and", "the", "a", "an", "to", "taste", "for", "or", "on"]);
  const relTokens = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/-\s*[\d.].*$/i, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !REL_STOP.has(t))
      .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));

  /** Order options by query-word coverage (most matched first), stable within each tier. */
  function relevantFirst(term, options) {
    const tt = relTokens(term);
    if (tt.length === 0) return options;
    return options
      .map((o, i) => {
        const nameSet = new Set(relTokens(o.name));
        const coverage = tt.reduce((n, x) => n + (nameSet.has(x) ? 1 : 0), 0);
        return { o, i, coverage };
      })
      .sort((a, b) => b.coverage - a.coverage || a.i - b.i)
      .map((x) => x.o);
  }

  /** Search one term by rendering the real results page in a hidden same-origin iframe. */
  function searchTerm(term) {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText =
        "position:absolute;left:-99999px;top:0;width:1200px;height:1800px;border:0;opacity:0;";
      iframe.src = `/shop/search-results.html?q=${encodeURIComponent(term)}`;
      let done = false;
      const started = Date.now();
      const finish = (options) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        try {
          iframe.remove();
        } catch (e) {
          /* ignore */
        }
        resolve(options);
      };
      const timer = setInterval(() => {
        let doc = null;
        try {
          doc = iframe.contentDocument;
        } catch (e) {
          /* cross-origin (shouldn't happen, same host) */
        }
        if (doc) {
          const cards = doc.querySelectorAll("product-item-al-v2, .pc-grid-prdItem");
          if (cards.length > 0) return finish(scrapeCards(doc, MAX_OPTIONS));
        }
        if (Date.now() - started >= SEARCH_TIMEOUT_MS) finish([]);
      }, 400);
      document.body.appendChild(iframe);
    });
  }

  /** Search every item with a small concurrency pool; onProgress(done, total) after each. */
  async function searchAll(items, onProgress) {
    let index = 0;
    let completed = 0;
    const worker = async () => {
      while (index < items.length) {
        const i = index++;
        const opts = relevantFirst(items[i].term, await searchTerm(items[i].term));
        items[i].options = opts;
        items[i].selectedIndex = opts.length > 0 ? 0 : -1;
        completed++;
        onProgress(completed, items.length);
      }
    };
    const pool = Array.from({ length: Math.min(SEARCH_CONCURRENCY, items.length) }, worker);
    await Promise.all(pool);
  }

  let cartReqSeq = 0;
  /** Add all selected items in a single cart call, via the main-world poster. */
  function addToCart(cartItems, f) {
    const url =
      `/abs/pub/erums/cartservice/api/v2/cart/items` +
      `?storeId=${encodeURIComponent(f.storeId)}` +
      `&serviceType=${encodeURIComponent(f.serviceType)}` +
      `&zipCode=${encodeURIComponent(f.zipCode)}` +
      `&cartCategoryList=1P,3P_MARKETPLACE,1P_Wine`;
    const body = {
      preferenceList: [{ cartCategory: f.cartCategory, storeId: Number(f.storeId) }],
      cartItemsList: cartItems.map((it) => ({
        itemId: String(it.itemId),
        qty: it.qty,
        comments: "",
        isSnsSub: false,
      })),
      cartCategory: f.cartCategory,
    };
    const requestId = `cart-${++cartReqSeq}`;
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.type !== "safeway-ext:cart-add-result" || d.requestId !== requestId) return;
        window.removeEventListener("message", onMsg);
        resolve(d);
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "safeway-ext:cart-add", requestId, url, body }, window.location.origin);
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve({ ok: false, status: 0, error: "timeout" });
      }, 25000);
    });
  }

  let keyPingSeq = 0;
  /** Ask the main-world poster whether it has captured Safeway's cart-service key yet. */
  function askHasKey() {
    const id = `haskey-${++keyPingSeq}`;
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.type !== "safeway-ext:has-key-result" || d.id !== id) return;
        window.removeEventListener("message", onMsg);
        resolve(!!d.has);
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "safeway-ext:has-key", id }, window.location.origin);
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve(false);
      }, 800);
    });
  }

  /**
   * Prime the cart-service key with no user action: Safeway makes no cart call on normal page
   * loads (the badge is cookie-driven), but the cart PAGE fetches the cart on load. So we load
   * /erums/cart in a hidden iframe; cart-inject there captures the key and relays it to us.
   * Resolves true once the key is available (or false on timeout).
   */
  async function primeKey() {
    if (await askHasKey()) return true;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:absolute;left:-99999px;top:0;width:1000px;height:1200px;border:0;opacity:0;";
    iframe.src = "/erums/cart";
    document.body.appendChild(iframe);
    const started = Date.now();
    try {
      while (Date.now() - started < 12000) {
        await new Promise((r) => setTimeout(r, 700));
        if (await askHasKey()) return true;
      }
      return false;
    } finally {
      try {
        iframe.remove();
      } catch (e) {
        /* ignore */
      }
    }
  }

  // --- tiny DOM helper ------------------------------------------------------
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v != null) node.setAttribute(k, v);
      }
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // --- UI: launcher + panel -------------------------------------------------

  function mountLauncher() {
    if (document.getElementById("safeway-ext-launcher")) return;
    const btn = el("button", {
      id: "safeway-ext-launcher",
      class: "swx-launcher",
      text: `🛒 Fill cart from Recipe App (${state.items.length})`,
      onclick: openPanel,
    });
    document.body.appendChild(btn);
  }

  function ensureRoot() {
    if (rootEl) return rootEl;
    rootEl = el("div", { id: "safeway-ext-root", class: "swx-root" });
    document.body.appendChild(rootEl);
    return rootEl;
  }

  function closePanel() {
    if (rootEl) rootEl.innerHTML = "";
    // Leave the launcher so the user can reopen without redoing the handoff.
    if (state && state.items && state.items.length) mountLauncher();
  }

  async function openPanel() {
    const launcher = document.getElementById("safeway-ext-launcher");
    if (launcher) launcher.remove();
    ensureRoot();

    // Already matched (fresh, or restored from cache on reload)? Skip straight to review.
    if (state.items.some((it) => Array.isArray(it.options) && it.options.length > 0)) {
      renderReview();
      return;
    }

    // Search right away — the results page renders products without a cart/service selection.
    // We only need a store at the actual add-to-cart step (checked in onAddAll).
    renderSearching(0, state.items.length);
    await searchAll(state.items, (done, total) => renderSearching(done, total));
    saveState();
    renderReview();
  }

  /** Force a fresh search (prices/availability may have changed since the cached match). */
  async function reMatch() {
    for (const it of state.items) {
      it.options = [];
      it.selectedIndex = -1;
      it.removed = false;
    }
    renderSearching(0, state.items.length);
    await searchAll(state.items, (done, total) => renderSearching(done, total));
    saveState();
    renderReview();
  }

  function panelShell(title, bodyNodes, footerNode) {
    rootEl.innerHTML = "";
    const header = el("div", { class: "swx-head" }, [
      el("span", { class: "swx-title", text: title }),
      el("button", { class: "swx-x", text: "×", "aria-label": "Close", onclick: closePanel }),
    ]);
    const body = el("div", { class: "swx-body" }, bodyNodes);
    // Footer (when given) is a sibling of the scroll body, not inside it — a solid bottom bar
    // that list rows can't scroll behind.
    const children = footerNode ? [header, body, footerNode] : [header, body];
    rootEl.appendChild(el("div", { class: "swx-panel" }, children));
  }

  function renderNeedStore() {
    panelShell(`Choose a ${bannerLabel} store first`, [
      el("p", {
        class: "swx-muted",
        text: `${bannerLabel} needs a store and a Delivery or Pickup selection before anything can be added to a cart. Pick those on ${bannerLabel} (top-left of the site), then come back and press “Add to ${bannerLabel} cart” again.`,
      }),
      el("a", { class: "swx-btn swx-btn-primary", href: "/", text: `Go to ${bannerLabel} home` }),
      el("button", { class: "swx-btn swx-btn-secondary", text: "Back to my list", onclick: renderReview }),
    ]);
  }

  function renderSearching(done, total) {
    panelShell(`Matching your list to ${bannerLabel}…`, [
      el("p", { class: "swx-muted", text: `Found products for ${done} of ${total} items.` }),
      el("div", { class: "swx-progress" }, [
        el("div", { class: "swx-progress-bar", style: `width:${total ? (done / total) * 100 : 0}%` }),
      ]),
    ]);
  }

  function selectedOption(item) {
    return item.selectedIndex >= 0 ? item.options[item.selectedIndex] : null;
  }

  function activeItems() {
    return state.items.filter((it) => !it.removed && selectedOption(it));
  }

  function renderReview() {
    saveState(); // persist matches + edits so a reload/reopen is instant
    const rows = state.items.map((item, idx) => renderRow(item, idx));
    const footer = renderFooter();
    panelShell(`Review your ${bannerLabel} cart`, [el("ul", { class: "swx-list" }, rows)], footer);
    // Restore scroll after the rebuild (button clicks re-render the whole list) and keep it
    // tracked, so quantity/remove/see-options round-trips don't bounce back to the top.
    const body = rootEl.querySelector(".swx-body");
    if (body) {
      body.scrollTop = reviewScroll;
      body.addEventListener("scroll", () => {
        reviewScroll = body.scrollTop;
      }, { passive: true });
    }
  }

  /** Full-screen overlay showing the product image larger; click anywhere to dismiss. */
  function showImageLightbox(src, alt) {
    if (!src) return;
    const overlay = el("div", {
      class: "swx-lightbox",
      role: "dialog",
      "aria-label": alt || "Product image",
      onclick: () => overlay.remove(),
    }, [el("img", { src, alt: alt || "", class: "swx-lightbox-img" })]);
    const onKey = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
  }

  function renderRow(item, idx) {
    if (item.removed) return null;
    const opt = selectedOption(item);
    const li = el("li", { class: "swx-row" });

    li.appendChild(el("div", { class: "swx-row-label", text: item.label }));
    if (Array.isArray(item.notes) && item.notes.length) {
      li.appendChild(el("div", { class: "swx-row-note", text: item.notes.join(", ") }));
    }

    if (!opt) {
      li.appendChild(el("div", { class: "swx-nomatch", text: `No ${bannerLabel} match found` }));
      li.appendChild(
        el("button", { class: "swx-link", text: "Remove", onclick: () => { item.removed = true; renderReview(); } }),
      );
      return li;
    }

    const img = el("div", { class: "swx-thumb" }, [
      opt.image
        ? el("img", {
            src: opt.image,
            alt: "",
            loading: "lazy",
            class: "swx-thumb-zoom",
            title: "Click to enlarge",
            onclick: () => showImageLightbox(opt.image, opt.name),
          })
        : el("div", { class: "swx-thumb-empty" }),
    ]);
    const info = el("div", { class: "swx-info" }, [
      el("div", { class: "swx-name", text: opt.name + (opt.size ? ` — ${opt.size}` : "") }),
      opt.price != null
        ? el("div", { class: "swx-price", text: `$${(opt.price * item.qty).toFixed(2)}${item.qty > 1 ? ` ($${opt.price.toFixed(2)} ea)` : ""}` })
        : null,
      el("div", { class: "swx-row-actions" }, [
        qtyStepper(item),
        item.options.length > 1
          ? el("button", { class: "swx-link", text: "See other options", onclick: () => renderOptions(item, idx) })
          : null,
        el("button", { class: "swx-link", text: "Remove", onclick: () => { item.removed = true; renderReview(); } }),
      ]),
    ]);
    li.appendChild(img);
    li.appendChild(info);
    return li;
  }

  function qtyStepper(item) {
    const val = el("span", { class: "swx-qty-val", text: String(item.qty) });
    return el("div", { class: "swx-qty" }, [
      el("button", { class: "swx-qty-btn", text: "−", "aria-label": "Decrease", onclick: () => { item.qty = Math.max(1, item.qty - 1); renderReview(); } }),
      val,
      el("button", { class: "swx-qty-btn", text: "+", "aria-label": "Increase", onclick: () => { item.qty += 1; renderReview(); } }),
    ]);
  }

  function renderOptions(item, idx) {
    const cards = item.options.map((opt, oi) =>
      el("button", {
        class: "swx-opt" + (oi === item.selectedIndex ? " swx-opt-sel" : ""),
        onclick: () => { item.selectedIndex = oi; renderReview(); },
      }, [
        opt.image ? el("img", { src: opt.image, alt: "", class: "swx-opt-img", loading: "lazy" }) : el("div", { class: "swx-opt-img swx-thumb-empty" }),
        el("div", { class: "swx-opt-name", text: opt.name + (opt.size ? ` — ${opt.size}` : "") }),
        opt.price != null ? el("div", { class: "swx-opt-price", text: `$${opt.price.toFixed(2)}` }) : null,
        oi === item.selectedIndex ? el("div", { class: "swx-opt-current", text: "Current pick" }) : null,
      ]),
    );
    panelShell(`Options for “${item.term}”`, [
      el("div", { class: "swx-opts" }, cards),
      el("button", { class: "swx-btn swx-btn-secondary", text: "Back to list", onclick: renderReview }),
    ]);
  }

  function renderFooter() {
    const items = activeItems();
    let sum = 0;
    let known = true;
    for (const it of items) {
      const o = selectedOption(it);
      if (o && o.price != null) sum += o.price * it.qty;
      else known = false;
    }
    const summary = el("div", { class: "swx-summary" }, [
      el("span", { text: `${items.length} item${items.length === 1 ? "" : "s"} selected` }),
      sum > 0 ? el("span", { class: "swx-est", text: `~$${sum.toFixed(2)}${known ? "" : "+"}` }) : null,
    ]);
    const cta = el("button", {
      class: "swx-btn swx-btn-primary swx-cta",
      text: `Add ${items.length} to ${bannerLabel} cart`,
      onclick: () => onAddAll(cta),
    });
    if (items.length === 0) cta.setAttribute("disabled", "true");
    return el("div", { class: "swx-footer" }, [
      summary,
      cta,
      el("p", { class: "swx-note" }, [
        `Adds items to your ${bannerLabel} cart — you review and check out on ${bannerLabel}. This doesn't place or pay for an order. `,
        el("button", { class: "swx-link", text: "Re-match", onclick: () => void reMatch() }),
      ]),
    ]);
  }

  async function onAddAll(cta) {
    const f = fulfillment();
    if (!f) return renderNeedStore();
    const items = activeItems().map((it) => ({ itemId: selectedOption(it).itemId, qty: it.qty }));
    if (items.length === 0) return;
    cta.setAttribute("disabled", "true");
    cta.textContent = "Adding…";
    let res = await addToCart(items, f);
    // Safeway makes no cart call on normal page loads, so the cart-service key may not be
    // captured yet ("no_key"). Auto-prime it invisibly (load /erums/cart in a hidden iframe),
    // then retry — no manual "add an item first" step needed.
    if (!res.ok && res.error === "no_key") {
      cta.textContent = `Connecting to ${bannerLabel}…`;
      const primed = await primeKey();
      if (primed) res = await addToCart(items, f);
    }
    if (res.ok) {
      clearSavedState(); // handoff fulfilled — drop the pending list + cached matches
      renderDone(items.length);
    } else {
      cta.removeAttribute("disabled");
      cta.textContent = `Add ${items.length} to ${bannerLabel} cart`;
      const body = rootEl.querySelector(".swx-body");
      if (body) {
        const existing = body.querySelector(".swx-error");
        if (existing) existing.remove();
        const msg =
          res.error === "no_key"
            ? `Couldn't connect to ${bannerLabel}'s cart. Make sure you're signed in with a store + Delivery/Pickup selected, then press Add again.`
            : `Couldn't add to cart (status ${res.status || "?"}). Make sure a store and a delivery or pickup time are selected on ${bannerLabel}, then try again.`;
        body.insertBefore(el("p", { class: "swx-error", text: msg }), body.firstChild);
      }
    }
  }

  function renderDone(count) {
    panelShell(`Added to your ${bannerLabel} cart 🎉`, [
      el("p", { text: `${count} item${count === 1 ? "" : "s"} added. Review quantities, pick a time, and check out on ${bannerLabel}.` }),
      el("a", { class: "swx-btn swx-btn-primary", href: "/erums/cart", text: `Open ${bannerLabel} cart` }),
      el("button", { class: "swx-btn swx-btn-secondary", text: "Close", onclick: closePanel }),
    ]);
  }

  // --- boot -----------------------------------------------------------------
  if (!extAlive()) return;
  chrome.storage.local.get(["pendingSafeway", "swxMatches"], (data) => {
    if (chrome.runtime && chrome.runtime.lastError) return;
    const pending = data && data.pendingSafeway;
    if (!pending || !Array.isArray(pending.items) || pending.items.length === 0) return;
    currentTs = pending.ts || null;

    // The extension injects on Safeway, Vons and Pavilions (one platform), but each handoff
    // targets a single banner. Only activate on that banner's domain, and label the UI with it.
    if (pending.banner && pending.banner.host && !hostMatches(pending.banner.host)) return;
    if (pending.banner && pending.banner.label) bannerLabel = pending.banner.label;

    // Restore already-matched results for this exact list so a reload is instant. Otherwise
    // start fresh from the handoff terms.
    const cached = data.swxMatches;
    if (cached && cached.ts === currentTs && Array.isArray(cached.items) && cached.items.length) {
      state = { items: cached.items };
    } else {
      state = {
        items: pending.items.map((it) => ({
          term: it.term,
          label: it.label || it.term,
          qty: Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1,
          notes: Array.isArray(it.notes) ? it.notes : [],
          options: [],
          selectedIndex: -1,
          removed: false,
        })),
      };
    }

    // Auto-open once per handoff (tracked per tab via sessionStorage). If the user closes it
    // or navigates elsewhere on Safeway, the floating launcher lets them reopen — without the
    // panel popping up again on every page.
    const openedKey = "swx-autoopened-" + (pending.ts || "x");
    let alreadyOpened = false;
    try {
      alreadyOpened = sessionStorage.getItem(openedKey) === "1";
    } catch (e) {
      /* ignore */
    }
    onBodyReady(() => {
      if (alreadyOpened) {
        mountLauncher();
      } else {
        try {
          sessionStorage.setItem(openedKey, "1");
        } catch (e) {
          /* ignore */
        }
        openPanel();
      }
    });
  });
})();
