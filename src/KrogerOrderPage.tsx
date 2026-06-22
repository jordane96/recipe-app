import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./kroger.css";
import { buildShoppingListData, type CombinedShoppingItem } from "./shoppingMerge";
import { parseNum, suggestQuantity, type Need } from "./krogerQuantity";
import type { IngredientDef, Recipe } from "./types";
import { useShoppingList } from "./ShoppingListContext";
import { useToast } from "./ToastContext";
import {
  getKrogerLocations,
  getKrogerStatus,
  krogerAuthorizeUrl,
  krogerBanner,
  krogerCartAdd,
  krogerCartUrl,
  KrogerApiError,
  matchKrogerProducts,
  setKrogerStore,
  type KrogerLocation,
  type KrogerProduct,
  type KrogerStatus,
} from "./krogerClient";

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Kroger isn't set up on the server yet (missing API credentials).",
  missing_code: "Kroger didn't return an authorization code. Please try connecting again.",
  bad_state: "That connection link expired. Please try connecting again.",
  token_exchange: "We couldn't complete the Kroger sign-in. Please try again.",
  access_denied: "You declined access to your Kroger account.",
};

/** Pull a clean search term out of a combined shopping line ("Name - 2 tbsp" → "Name"). */
function termFromLine(line: string): string {
  return line.split(" - ")[0]!.trim();
}

/** The recipe's needed amount (for the quantity suggestion), derived from a combined line. */
function needFromItem(it: CombinedShoppingItem): Need | null {
  if (it.kind === "weight") return { dim: "weight", oz: it.oz };
  if (it.kind === "volume") return { dim: "volume", tsp: it.tsp };
  if (it.kind === "count") {
    // Combined count lines look like "Eggs - 6 each"; only generic counts map to packages.
    const after = it.line.split(" - ").slice(1).join(" - ");
    const m = after.match(/^([\d.\/]+)\s+([a-zA-Z]+)/);
    if (m) {
      const n = parseNum(m[1]!);
      const unit = m[2]!.toLowerCase();
      if (n && n > 0 && (unit === "each" || unit === "ct" || unit === "count")) {
        return { dim: "count", count: n };
      }
    }
  }
  return null; // raw / qualitative / non-generic counts → default qty 1
}

type Row = {
  key: string;
  term: string;
  /** Original shopping-list line (for display + dedupe). */
  label: string;
  options: KrogerProduct[];
  selectedUpc: string | null;
  quantity: number;
  /** Recipe amount this line needs (drives the suggested quantity); null = no suggestion. */
  need: Need | null;
};

function productName(p: KrogerProduct): string {
  // Kroger's `description` already includes the brand, so prepending `brand` doubles it.
  return (p.description || p.brand || p.upc).trim();
}

function dedupeByUpc(products: KrogerProduct[]): KrogerProduct[] {
  const seen = new Set<string>();
  const out: KrogerProduct[] = [];
  for (const p of products) {
    if (!p.upc || seen.has(p.upc)) continue;
    seen.add(p.upc);
    out.push(p);
  }
  return out;
}

export function KrogerOrderPage({
  recipes,
  ingredients,
  currentUser,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
  currentUser: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { selectedIds, servingsByRecipe, additionalItems, isPurchased } = useShoppingList();

  const [status, setStatus] = React.useState<KrogerStatus | null>(null);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  // One-shot banner from the OAuth callback redirect (?kroger=connected / ?kroger_error=...).
  const connectedFlag = searchParams.get("kroger") === "connected";
  const errorCode = searchParams.get("kroger_error");

  // Storefront banner for the selected store (Ralphs, Kroger, …) — drives checkout copy + link.
  const banner = krogerBanner(status?.locationChain ?? null);

  // ---- Load connection status -------------------------------------------------
  const refreshStatus = React.useCallback(async () => {
    try {
      const s = await getKrogerStatus(currentUser);
      setStatus(s);
      setStatusError(null);
      return s;
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Could not load Kroger status.");
      return null;
    }
  }, [currentUser]);

  React.useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // ---- Build the "things to buy" list from the shopping list ------------------
  const buyItems = React.useMemo(() => {
    const order: string[] = [];
    const counts = new Map<string, { recipe: Recipe; count: number }>();
    for (const id of selectedIds) {
      const r = recipes.find((x) => x.id === id);
      if (!r) continue;
      if (!counts.has(r.id)) {
        order.push(r.id);
        counts.set(r.id, { recipe: r, count: 0 });
      }
      counts.get(r.id)!.count += 1;
    }
    const entries = order.map((id) => {
      const { recipe } = counts.get(id)!;
      const base = typeof recipe.servings === "number" && recipe.servings > 0 ? recipe.servings : null;
      const override = servingsByRecipe[recipe.id];
      const target = typeof override === "number" && override > 0 ? override : base ?? 1;
      const scale = base == null ? 1 : target / base;
      return { recipe, scale };
    });
    const { combinedItems } = buildShoppingListData(entries, ingredients);

    const fromRecipes = combinedItems
      .filter((it) => !isPurchased(it.line))
      .map((it) => ({ key: it.line, name: termFromLine(it.line), label: it.line, need: needFromItem(it) }));
    const fromAdditional = additionalItems
      .filter((t) => !isPurchased(t))
      .map((t) => ({ key: `additional:${t}`, name: t, label: t, need: null as Need | null }));
    return [...fromRecipes, ...fromAdditional];
  }, [selectedIds, recipes, ingredients, servingsByRecipe, additionalItems, isPurchased]);

  // ---- Store picker -----------------------------------------------------------
  const [pickingStore, setPickingStore] = React.useState(false);
  const [zip, setZip] = React.useState("");
  const [locations, setLocations] = React.useState<KrogerLocation[] | null>(null);
  const [locLoading, setLocLoading] = React.useState(false);
  const [locError, setLocError] = React.useState<string | null>(null);

  const findStores = React.useCallback(async () => {
    if (!/^\d{5}$/.test(zip.trim())) {
      setLocError("Enter a 5-digit ZIP code.");
      return;
    }
    setLocLoading(true);
    setLocError(null);
    try {
      const { locations: locs } = await getKrogerLocations(zip.trim());
      setLocations(locs);
      if (locs.length === 0) setLocError("No Kroger-family stores found near that ZIP.");
    } catch (e) {
      setLocError(e instanceof Error ? e.message : "Could not search stores.");
    } finally {
      setLocLoading(false);
    }
  }, [zip]);

  const chooseStore = React.useCallback(
    async (loc: KrogerLocation) => {
      try {
        await setKrogerStore(currentUser, loc.locationId, loc.name, loc.chain ?? null);
        setPickingStore(false);
        setLocations(null);
        setZip("");
        await refreshStatus();
        showToast(`Store set to ${loc.name}`);
      } catch (e) {
        setLocError(e instanceof Error ? e.message : "Could not save that store.");
      }
    },
    [currentUser, refreshStatus, showToast],
  );

  // ---- Product matching -------------------------------------------------------
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [matchLoading, setMatchLoading] = React.useState(false);
  const [matchError, setMatchError] = React.useState<string | null>(null);
  /** When set, show the product-picker page for this row key. */
  const [changingKey, setChangingKey] = React.useState<string | null>(null);
  /** The option tapped in the picker — pending until the user confirms "Replace item". */
  const [pendingUpc, setPendingUpc] = React.useState<string | null>(null);
  /** locationId the current `rows` were matched against, so a store change re-matches. */
  const matchedForRef = React.useRef<string | null>(null);
  /** Order-card elements, so we can re-center on an item after the picker closes. */
  const cardRefs = React.useRef(new Map<string, HTMLLIElement>());
  /** The row key to scroll back to once the picker closes. */
  const restoreToKeyRef = React.useRef<string | null>(null);

  const runMatch = React.useCallback(async () => {
    if (buyItems.length === 0) {
      setRows([]);
      return;
    }
    setMatchLoading(true);
    setMatchError(null);
    try {
      const { matches } = await matchKrogerProducts(
        currentUser,
        buyItems.map(({ key, name }) => ({ key, name })),
      );
      const byKey = new Map(matches.map((m) => [m.key, m]));
      const next: Row[] = buyItems.map((it) => {
        const m = byKey.get(it.key);
        const options = dedupeByUpc([...(m?.best ? [m.best] : []), ...(m?.alternates ?? [])]);
        const best = options[0] ?? null;
        return {
          key: it.key,
          term: m?.term ?? it.name,
          label: it.label,
          options,
          selectedUpc: best?.upc ?? null,
          quantity: suggestQuantity(it.need, best?.size ?? null),
          need: it.need,
        };
      });
      setRows(next);
      matchedForRef.current = status?.locationId ?? null;
    } catch (e) {
      if (e instanceof KrogerApiError && e.code === "no_store") {
        setPickingStore(true);
      }
      setMatchError(e instanceof Error ? e.message : "Could not match products.");
    } finally {
      setMatchLoading(false);
    }
  }, [buyItems, currentUser, status?.locationId]);

  // Auto-match once we're connected + have a store, and re-match if the store changes.
  const ready = status?.connected && status?.locationId && !pickingStore;
  React.useEffect(() => {
    if (!ready) return;
    if (matchedForRef.current === status?.locationId && rows !== null) return;
    void runMatch();
  }, [ready, status?.locationId, rows, runMatch]);

  // Reset the picker's pending choice whenever it opens or closes.
  React.useEffect(() => {
    setPendingUpc(null);
  }, [changingKey]);

  // Picker scroll: jump to the top when it opens; restore to the changed item when it closes.
  React.useLayoutEffect(() => {
    if (changingKey) {
      window.scrollTo(0, 0);
      document.querySelector(".app-shell")?.scrollTo(0, 0);
    } else if (restoreToKeyRef.current) {
      cardRefs.current.get(restoreToKeyRef.current)?.scrollIntoView({ block: "center" });
      restoreToKeyRef.current = null;
    }
  }, [changingKey]);

  // ---- Editing rows -----------------------------------------------------------
  const updateRow = React.useCallback((key: string, patch: Partial<Row>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));
  }, []);

  /** Remove an item from this order. It stays on the shopping list. */
  const removeRow = React.useCallback((key: string) => {
    setRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
  }, []);

  /** Pick a different product for an item, re-suggesting qty if the package size changes. */
  const chooseOption = React.useCallback((key: string, upc: string) => {
    setRows((prev) =>
      prev
        ? prev.map((r) => {
            if (r.key !== key) return r;
            const newProd = r.options.find((o) => o.upc === upc);
            const oldProd = r.options.find((o) => o.upc === r.selectedUpc);
            const quantity =
              newProd && (!oldProd || oldProd.size !== newProd.size)
                ? suggestQuantity(r.need, newProd.size)
                : r.quantity;
            return { ...r, selectedUpc: upc, quantity };
          })
        : prev,
    );
    restoreToKeyRef.current = key;
    setChangingKey(null);
  }, []);

  const includedRows = React.useMemo(
    () => (rows ?? []).filter((r) => r.selectedUpc),
    [rows],
  );

  const estTotal = React.useMemo(() => {
    let sum = 0;
    let known = true;
    for (const r of includedRows) {
      const p = r.options.find((o) => o.upc === r.selectedUpc);
      if (typeof p?.price === "number") sum += p.price * r.quantity;
      else known = false;
    }
    return { sum, known };
  }, [includedRows]);

  // ---- Send to cart -----------------------------------------------------------
  const [submitting, setSubmitting] = React.useState(false);
  const [sentCount, setSentCount] = React.useState<number | null>(null);

  const sendToCart = React.useCallback(async () => {
    const items = includedRows.map((r) => ({ upc: r.selectedUpc!, quantity: r.quantity }));
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      const { count } = await krogerCartAdd(currentUser, items);
      setSentCount(count);
      showToast(`Added ${count} item${count === 1 ? "" : "s"} to your ${banner.label} cart`);
    } catch (e) {
      if (e instanceof KrogerApiError && e.code === "not_connected") {
        showToast("Your Kroger session expired — please reconnect.");
        await refreshStatus();
      } else {
        showToast(e instanceof Error ? e.message : "Could not add items to your Kroger cart.");
      }
    } finally {
      setSubmitting(false);
    }
  }, [includedRows, currentUser, refreshStatus, showToast, banner.label]);

  // ---------------------------------------------------------------------------

  const dismissBanner = React.useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("kroger");
    next.delete("kroger_error");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Product-picker page: takes over the view while swapping an item's product.
  const changingRow = changingKey ? rows?.find((r) => r.key === changingKey) ?? null : null;
  if (changingRow) {
    return (
      <div className="recipe-list-page kroger-page">
        <div className="top-bar">
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Other options for “{changingRow.term}”
          </h1>
        </div>
        <ul className="kroger-review-list">
          {changingRow.options.map((opt) => {
            const isCurrent = opt.upc === changingRow.selectedUpc;
            const isSelected = opt.upc === pendingUpc;
            const optQty = suggestQuantity(changingRow.need, opt.size);
            return (
              <li key={opt.upc}>
                <button
                  type="button"
                  className={`kroger-row kroger-opt-card${isSelected ? " kroger-opt-card--selected" : ""}`}
                  aria-pressed={isSelected}
                  onClick={() => setPendingUpc(opt.upc)}
                >
                  <div className="kroger-row-img" aria-hidden>
                    {opt.image ? (
                      <img src={opt.image} alt="" loading="lazy" />
                    ) : (
                      <div className="kroger-row-img-empty" />
                    )}
                  </div>
                  <div className="kroger-row-name">
                    {productName(opt)}
                    {opt.size ? `, ${opt.size} per unit` : ""}
                  </div>
                  {opt.price != null ? (
                    <div className="kroger-row-price">
                      <strong>${(opt.price * optQty).toFixed(2)}</strong>{" "}
                      <span className="kroger-row-perunit">
                        {optQty > 1
                          ? `(${optQty} × $${opt.price.toFixed(2)})`
                          : `($${opt.price.toFixed(2)}/unit)`}
                      </span>
                    </div>
                  ) : null}
                  {isCurrent ? <div className="kroger-opt-current">Current pick</div> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="kroger-change-cta">
          <button
            type="button"
            className="btn-primary"
            disabled={pendingUpc == null}
            onClick={() => pendingUpc && chooseOption(changingRow.key, pendingUpc)}
          >
            Change item
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              restoreToKeyRef.current = changingRow.key;
              setChangingKey(null);
            }}
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="recipe-list-page kroger-page">
      <div className="top-bar">
        <Link to="/shopping" className="back-btn" aria-label="Go back to shopping list">
          Go back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Order groceries
        </h1>
      </div>

      {connectedFlag ? (
        <div className="kroger-banner kroger-banner--success" role="status">
          <span>Kroger account connected.</span>
          <button type="button" className="kroger-banner-x" aria-label="Dismiss" onClick={dismissBanner}>
            ×
          </button>
        </div>
      ) : null}
      {errorCode ? (
        <div className="kroger-banner kroger-banner--error" role="alert">
          <span>{ERROR_MESSAGES[errorCode] ?? `Kroger error: ${errorCode}`}</span>
          <button type="button" className="kroger-banner-x" aria-label="Dismiss" onClick={dismissBanner}>
            ×
          </button>
        </div>
      ) : null}

      {/* Loading / status error */}
      {status === null && !statusError ? <p className="muted">Loading…</p> : null}
      {statusError ? <p className="err">{statusError}</p> : null}

      {/* Not configured on the server */}
      {status && !status.configured ? (
        <div className="kroger-card">
          <h2>Kroger isn't set up yet</h2>
          <p className="muted">
            This app needs Kroger API credentials (<code>KROGER_CLIENT_ID</code>,{" "}
            <code>KROGER_CLIENT_SECRET</code>, <code>KROGER_REDIRECT_URI</code>) configured on the
            server before grocery ordering works.
          </p>
        </div>
      ) : null}

      {/* Connect */}
      {status && status.configured && !status.connected ? (
        <div className="kroger-card">
          <h2>Connect your Kroger account</h2>
          <p className="muted">
            Link your Kroger account to send this shopping list to your cart. You'll review and
            check out on Kroger.
          </p>
          <button
            type="button"
            className="btn-primary btn-cta-wide"
            onClick={() => {
              window.location.href = krogerAuthorizeUrl(currentUser);
            }}
          >
            Connect Kroger
          </button>
        </div>
      ) : null}

      {/* Store picker */}
      {status && status.connected && (pickingStore || !status.locationId) ? (
        <div className="kroger-card">
          <h2>Choose your store</h2>
          <p className="muted">Products and prices depend on the store. Search by ZIP code.</p>
          <form
            className="kroger-zip-row"
            onSubmit={(e) => {
              e.preventDefault();
              void findStores();
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              className="kroger-zip-input"
              placeholder="ZIP code"
              value={zip}
              maxLength={5}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
              aria-label="ZIP code"
            />
            <button type="submit" className="btn-primary btn-compact" disabled={locLoading}>
              {locLoading ? "Searching…" : "Find stores"}
            </button>
          </form>
          {locError ? <p className="err">{locError}</p> : null}
          {locations && locations.length > 0 ? (
            <ul className="kroger-store-list">
              {locations.map((loc) => (
                <li key={loc.locationId}>
                  <button type="button" className="kroger-store-option" onClick={() => void chooseStore(loc)}>
                    <span className="kroger-store-name">{loc.name}</span>
                    {loc.address ? (
                      <span className="kroger-store-addr">
                        {loc.address.line1}, {loc.address.city} {loc.address.state} {loc.address.zip}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {status.locationId ? (
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => setPickingStore(false)}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Review + send */}
      {ready ? (
        sentCount !== null ? (
          <div className="kroger-card kroger-success">
            <h2>Added to your cart 🎉</h2>
            <p>
              {sentCount} item{sentCount === 1 ? "" : "s"} were added to your{" "}
              <strong>{status?.locationName ?? "Kroger"}</strong> cart. Checkout for {banner.label}{" "}
              happens on its own site — review quantities, pick pickup or delivery, and pay there.
            </p>
            <a
              className="btn-primary btn-cta-wide"
              href={krogerCartUrl(status?.locationChain)}
              target="_blank"
              rel="noreferrer"
            >
              Open {banner.label} to check out
            </a>
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => {
                setSentCount(null);
                matchedForRef.current = null;
                void runMatch();
              }}
            >
              Back to list
            </button>
          </div>
        ) : (
          <>
            <div className="kroger-store-bar">
              <svg
                className="kroger-store-bar-pin"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <div className="kroger-store-bar-info">
                <span className="kroger-store-bar-name">{status?.locationName ?? "your store"}</span>
              </div>
              <button
                type="button"
                className="kroger-store-bar-change"
                onClick={() => {
                  setPickingStore(true);
                  setLocations(null);
                }}
              >
                Change store
              </button>
            </div>

            {matchLoading ? <p className="muted">Finding products at your store…</p> : null}
            {matchError ? <p className="err">{matchError}</p> : null}

            {rows && rows.length === 0 && !matchLoading ? (
              <div className="kroger-card">
                <p className="muted">
                  Your shopping list is empty.{" "}
                  <Link to="/shopping">Add some items</Link> first.
                </p>
              </div>
            ) : null}

            {rows && rows.length > 0 ? (
              <>
                <ul className="kroger-review-list">
                  {rows.map((row) => {
                    const selected = row.options.find((o) => o.upc === row.selectedUpc) ?? null;
                    const noMatch = row.options.length === 0;
                    const price = selected?.price ?? null;
                    return (
                      <li
                        key={row.key}
                        className="kroger-row"
                        ref={(el) => {
                          if (el) cardRefs.current.set(row.key, el);
                          else cardRefs.current.delete(row.key);
                        }}
                      >
                        {/* Title: the recipe item this line calls for. */}
                        <div className="kroger-row-term">{row.label}</div>

                        {/* Big centered product photo. */}
                        <div className="kroger-row-img" aria-hidden>
                          {selected?.image ? (
                            <img src={selected.image} alt="" loading="lazy" />
                          ) : (
                            <div className="kroger-row-img-empty" />
                          )}
                        </div>

                        {noMatch ? (
                          <div className="kroger-row-product">
                            <div className="kroger-row-nomatch">No Kroger match found</div>
                            <div className="kroger-row-actions">
                              <button
                                type="button"
                                className="kroger-row-remove"
                                onClick={() => removeRow(row.key)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="kroger-row-product">
                            {/* Product name + per-unit size. */}
                            <div className="kroger-row-name">
                              {selected ? productName(selected) : "—"}
                              {selected?.size ? `, ${selected.size} per unit` : ""}
                            </div>

                            {/* Quantity + remove. */}
                            <div className="kroger-row-qty-row">
                              <div
                                className="kroger-qty"
                                role="group"
                                aria-label={`Quantity for ${row.term}`}
                              >
                                <button
                                  type="button"
                                  className="kroger-qty-btn"
                                  aria-label="Decrease quantity"
                                  onClick={() => updateRow(row.key, { quantity: Math.max(1, row.quantity - 1) })}
                                >
                                  −
                                </button>
                                <span className="kroger-qty-val">{row.quantity}</span>
                                <button
                                  type="button"
                                  className="kroger-qty-btn"
                                  aria-label="Increase quantity"
                                  onClick={() => updateRow(row.key, { quantity: row.quantity + 1 })}
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                className="kroger-row-remove"
                                onClick={() => removeRow(row.key)}
                              >
                                Remove
                              </button>
                            </div>

                            {/* Price: total + per-unit. */}
                            {price != null ? (
                              <div className="kroger-row-price">
                                <strong>${(price * row.quantity).toFixed(2)}</strong>{" "}
                                <span className="kroger-row-perunit">(${price.toFixed(2)}/unit)</span>
                              </div>
                            ) : null}

                            {/* Change, below the price. */}
                            <div className="kroger-row-actions">
                              <button
                                type="button"
                                className="kroger-row-change"
                                onClick={() => setChangingKey(row.key)}
                              >
                                See other options
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="kroger-footer">
                  <div className="kroger-footer-summary">
                    <span>
                      {includedRows.length} item{includedRows.length === 1 ? "" : "s"} selected
                    </span>
                    {estTotal.sum > 0 ? (
                      <span className="kroger-est">
                        ~${estTotal.sum.toFixed(2)}
                        {estTotal.known ? "" : "+"}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn-primary btn-cta-wide"
                    disabled={includedRows.length === 0 || submitting}
                    onClick={() => void sendToCart()}
                  >
                    {submitting
                      ? "Sending…"
                      : `Send ${includedRows.length} to ${banner.label} cart`}
                  </button>
                  <p className="kroger-note">
                    Adds items to your {banner.label} cart, where you'll review and check out —
                    this doesn't place or pay for an order.
                  </p>
                </div>
              </>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
