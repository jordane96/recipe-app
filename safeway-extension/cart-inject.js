// Runs in the PAGE's main world (not the isolated content-script world) so the cart POST
// goes out like Safeway's own site makes it — same origin, same cookies, same session.
//
// Safeway's cart API sits behind an Azure API Management gateway. Each Safeway microservice has
// its OWN `ocp-apim-subscription-key` (compiled into the site bundle), plus the request carries
// the user's `authorization` bearer. Sending another service's key to the cart endpoint => 401.
// Safeway makes NO cart-service call on normal page load (the badge count comes from a cookie),
// so there's nothing to sniff until a cart request happens. The cart PAGE (/erums/cart) does
// fetch the cart on load — so the extension primes the key by loading it in a hidden iframe.
// This script (running in every frame) captures the key + bearer from any cart-service call and,
// if it's in a subframe, relays them up to the top frame. Values never leave the browser.

(() => {
  const CART_SERVICE = "cartservice";
  const creds = { key: null, auth: null };
  const inSubframe = window.top !== window.self;

  const isCartUrl = (url) => {
    try {
      return String(url || "").includes(CART_SERVICE);
    } catch (e) {
      return false;
    }
  };
  const relayUp = () => {
    if (!inSubframe || !creds.key) return;
    try {
      window.top.postMessage(
        { type: "safeway-ext:relay-creds", key: creds.key, auth: creds.auth },
        window.location.origin,
      );
    } catch (e) {
      /* ignore */
    }
  };
  const remember = (name, value) => {
    const n = String(name || "").toLowerCase();
    if (value && n === "ocp-apim-subscription-key") creds.key = String(value);
    if (value && n === "authorization") creds.auth = String(value);
    if (creds.key) relayUp();
  };

  // Capture from fetch() calls to the cart service.
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = (input && input.url) || input;
      if (isCartUrl(url)) {
        const h = (init && init.headers) || (input && input.headers);
        if (h) {
          if (typeof h.forEach === "function") h.forEach((v, k) => remember(k, v));
          else for (const k of Object.keys(h)) remember(k, h[k]);
        }
      }
    } catch (e) {
      /* ignore */
    }
    return origFetch.apply(this, arguments);
  };

  // Capture from XHR calls to the cart service (Angular HttpClient uses XHR).
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  proto.open = function (method, url) {
    this.__swUrl = url;
    return origOpen.apply(this, arguments);
  };
  const origSet = proto.setRequestHeader;
  proto.setRequestHeader = function (k, v) {
    try {
      if (isCartUrl(this.__swUrl)) remember(k, v);
    } catch (e) {
      /* ignore */
    }
    return origSet.apply(this, arguments);
  };

  // Receive creds relayed up from a subframe (e.g. the hidden /erums/cart priming iframe).
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const d = event.data;
    if (!d || d.type !== "safeway-ext:relay-creds" || !d.key) return;
    creds.key = d.key;
    if (d.auth) creds.auth = d.auth;
  });

  // Commands from our content script (same window).
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d) return;

    if (d.type === "safeway-ext:has-key") {
      window.postMessage(
        { type: "safeway-ext:has-key-result", id: d.id, has: !!creds.key },
        window.location.origin,
      );
      return;
    }

    if (d.type !== "safeway-ext:cart-add") return;
    const reply = (payload) =>
      window.postMessage(
        { type: "safeway-ext:cart-add-result", requestId: d.requestId, ...payload },
        window.location.origin,
      );

    if (!creds.key) {
      reply({ ok: false, status: 0, error: "no_key" });
      return;
    }
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "ocp-apim-subscription-key": creds.key,
    };
    if (creds.auth) headers["authorization"] = creds.auth;

    try {
      const res = await fetch(d.url, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(d.body),
      });
      let json = null;
      try {
        json = await res.json();
      } catch (e) {
        /* non-JSON */
      }
      const count =
        (json && (json.cartItemCount ?? (Array.isArray(json.cart) ? json.cart.length : null))) ??
        null;
      reply({ ok: res.ok, status: res.status, count });
    } catch (e) {
      reply({ ok: false, status: 0, error: String(e) });
    }
  });
})();
