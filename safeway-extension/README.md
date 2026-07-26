# Recipe App → Safeway Cart (browser extension)

Fills your **Safeway** cart from a Recipe App shopping list. Safeway has no public ordering
API and no account-link handshake (unlike Kroger), so this can't run on a server — it has to
run inside **your own logged-in Safeway session** in the browser. That's what this extension is.

**Personal use only.** It automates the same clicks you'd make yourself. It relies on
Safeway's private (undocumented) endpoints and page structure, so it may break when Safeway
changes their site. It is not affiliated with Safeway/Albertsons, and automating the site is
against their Terms of Service — fine for your own account, not something to distribute.

## What it does

1. In the Recipe App, open **Shopping list → Safeway** and press **Send to Safeway**.
2. The extension stores the list and opens a Safeway tab.
3. Click the **🛒 Fill cart from Recipe App** button (bottom-right).
4. It searches each item (in hidden background frames — the page you're on doesn't move),
   then shows a review panel: product photo, name, size, price, quantity, and
   **See other options** to switch the matched product — mirroring the Kroger flow.
5. Press **Add to Safeway cart**. It adds everything in one call.
6. You review, pick a delivery/pickup time, and check out **on Safeway**. The extension never
   places or pays for an order.

## Requirements

- Desktop **Chrome** (or any Chromium browser: Edge, Brave). Mobile Chrome has no extensions.
- You must be **signed in to safeway.com** and have a **store + Delivery/Pickup** selected
  (Safeway blocks add-to-cart until a fulfillment option is chosen). If the panel says
  "choose a store first," open any product on Safeway, pick Delivery or Pickup, then retry.

## Install (unpacked)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `safeway-extension/` folder.
4. Confirm the Recipe App's URL is covered in `manifest.json` → `content_scripts` (the
   `bridge.js` block). It's preconfigured for `localhost`, `127.0.0.1`, and
   `https://jordane96.github.io/*`. Add your host if you deploy elsewhere, then reload the
   extension.

## How it works (for future maintenance)

- `bridge.js` — runs on the Recipe App page; relays the "send to Safeway" broadcast to the
  service worker and stamps `data-safeway-ext="1"` so the app can show "extension detected."
- `background.js` — stores the list and opens safeway.com.
- `safeway-content.js` — the launcher + review panel; searches via hidden same-origin
  `search-results.html` iframes and scrapes `<product-item-al-v2>` cards (product id lives in
  the `product-details.<id>.html` link).
- `cart-inject.js` — runs in the page's main world so the cart POST uses Safeway's own session.

### The endpoints it depends on (may change)

- **Search:** `GET /shop/search-results.html?q=<term>` — rendered, then scraped.
- **Add to cart:** `POST /abs/pub/erums/cartservice/api/v2/cart/items?storeId=&serviceType=&zipCode=&cartCategoryList=1P,3P_MARKETPLACE,1P_Wine`
  with body `{ preferenceList:[{cartCategory,storeId}], cartItemsList:[{itemId,qty,comments,isSnsSub}], cartCategory }`.
  This endpoint is behind an Azure API Management gateway. Each Safeway microservice has its **own**
  `ocp-apim-subscription-key` (compiled into the site bundle), and the request also carries the
  user's `authorization` bearer — a plain cookie-only fetch, or one bearing a *different* service's
  key, returns **401**. Those values aren't in any page global, so `cart-inject.js` **passively
  sniffs the key + bearer from Safeway's own calls to the CART service specifically** (matched by
  the `cartservice` path — the site fetches your cart on load / after any cart change) and reuses
  exactly those. Nothing leaves the browser; they're only reattached to the same-origin cart
  request Safeway itself makes. If adds start 401ing, verify the cart request still carries an
  `ocp-apim-subscription-key` on a `.../cartservice/...` URL.
- **Fulfillment params** (`storeId`, `serviceType`, `zipCode`, `cartCategory`) are read from
  `localStorage["abCart"]`, which Safeway populates once you pick a store and delivery/pickup.

If adds start failing, re-capture these from DevTools → Network on a manual add-to-cart and
update `safeway-content.js`.
