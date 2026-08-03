import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import "./kroger.css";
import type { IngredientDef, Recipe } from "./types";
import { useBuyItems } from "./useBuyItems";
import { useToast } from "./ToastContext";
import {
  bannerById,
  getSafewayExtensionStatus,
  publishSafewayHandoff,
  SAFEWAY_BANNERS,
  type SafewayHandoffItem,
} from "./safewayHandoff";
import { isLikelyMobile } from "./deviceType";

/**
 * Where to download the packed ordering extension (Chrome, desktop). TODO: set this to the hosted
 * link (e.g. a Google Drive share) once the build is published; until then the "Get extension"
 * button just tells the user it's coming.
 */
const EXTENSION_DOWNLOAD_URL = "";

/**
 * Ordering for the Albertsons banners (Safeway / Vons / Pavilions — same platform, same extension).
 * Unlike Kroger (official API, see {@link KrogerOrderPage}), these have no public cart API, so the
 * page hands the list to the companion browser extension, which fills the cart from the user's own
 * logged-in session. Desktop Chrome only; when the extension is absent, guidance splits by device
 * (see {@link isLikelyMobile}). The user first picks a banner (`?banner=` query param).
 */
export function SafewayOrderPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { showToast } = useToast();
  const buyItems = useBuyItems(recipes, ingredients);
  const [searchParams, setSearchParams] = useSearchParams();
  const banner = bannerById(searchParams.get("banner"));

  // The extension announces itself by stamping the <html> element; re-check on mount.
  const [extStatus, setExtStatus] = React.useState<"present" | "stale" | "absent">("absent");
  React.useEffect(() => {
    setExtStatus(getSafewayExtensionStatus());
    const id = window.setInterval(() => setExtStatus(getSafewayExtensionStatus()), 1000);
    return () => window.clearInterval(id);
  }, []);
  // Extension is desktop-Chrome-only; when it's absent, tailor guidance by device.
  const [mobile] = React.useState(() => isLikelyMobile());

  const handoffItems: SafewayHandoffItem[] = React.useMemo(
    () =>
      buyItems.map((it) => ({
        term: it.name,
        label: it.label,
        // Starting quantity only. The extension recomputes it from `need` and the matched
        // product's package size, because that size isn't known until it has searched.
        qty: 1,
        need: it.need,
        notes: it.notes,
      })),
    [buyItems],
  );

  const sendToSafeway = React.useCallback(() => {
    if (handoffItems.length === 0 || !banner) return;
    publishSafewayHandoff(handoffItems, banner);
    showToast(`Sent to ${banner.label} — opening a ${banner.label} tab to fill your cart.`);
  }, [handoffItems, banner, showToast]);

  const copyList = React.useCallback(async () => {
    const text = handoffItems.map((it) => it.term).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied the list to your clipboard.");
    } catch {
      showToast("Couldn't access the clipboard.");
    }
  }, [handoffItems, showToast]);

  // ---- Step 1: pick a banner (Safeway / Vons / Pavilions) ---------------------
  if (!banner) {
    return (
      <div className="recipe-list-page">
        <div className="top-bar">
          <Link to="/place-order" className="back-btn" aria-label="Back to store options">
            Go back
          </Link>
          <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
            Choose your store
          </h1>
        </div>
        <div className="kroger-card">
          <h2>Which store?</h2>
          <p className="muted">
            Safeway, Vons, and Pavilions run on the same platform — pick the one you shop.
          </p>
          {SAFEWAY_BANNERS.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={`${i === 0 ? "btn-primary" : "btn-secondary"} btn-cta-wide`}
              style={i === 0 ? undefined : { marginTop: "0.75rem" }}
              onClick={() => setSearchParams({ banner: b.id })}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Step 2: order from the chosen banner -----------------------------------
  const loginUrl = `https://${banner.host}`;
  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to="/order/safeway" className="back-btn" aria-label="Change store">
          Go back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Order from {banner.label}
        </h1>
      </div>

      <div className="kroger-card">
        <h2>Send this list to {banner.label}</h2>
        {extStatus === "present" ? (
          // Desktop with the extension installed → send straight to the cart.
          <>
            <p className="muted" style={{ color: "var(--ok, #1a7f37)" }}>
              ✓ Ordering extension detected.
            </p>
            <p className="muted">
              Press Send below — it opens {banner.label} in your logged-in session, matches each
              item, and lets you review and add everything to your cart. You finish checkout on{" "}
              {banner.label}.
            </p>
            <button
              type="button"
              className="btn-primary btn-cta-wide"
              disabled={handoffItems.length === 0}
              onClick={sendToSafeway}
            >
              {handoffItems.length === 0
                ? "Your shopping list is empty"
                : `Send ${handoffItems.length} item${handoffItems.length === 1 ? "" : "s"} to ${banner.label}`}
            </button>
            <button
              type="button"
              className="btn-secondary btn-compact"
              style={{ marginTop: "0.75rem" }}
              disabled={handoffItems.length === 0}
              onClick={() => void copyList()}
            >
              Copy list
            </button>
          </>
        ) : extStatus === "stale" ? (
          <p className="muted" style={{ color: "#a4160f" }}>
            ⚠ The extension was reloaded — refresh this page (Ctrl+F5) to reconnect, then press
            Send again.
          </p>
        ) : mobile ? (
          // Phone → screenshot the whole list into one image for "Import from List".
          <>
            <p className="muted">
              To order from {banner.label} on your phone: screenshot your full list, then upload it
              to the {banner.label} app's <strong>Import from List</strong>. It accepts only one
              screenshot, so we fit your whole list into a single image.
            </p>
            <Link
              to={`/order/safeway/screenshot?banner=${banner.id}`}
              className="btn-primary btn-cta-wide"
            >
              Get screenshot
            </Link>
            <a
              href={loginUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-cta-wide"
              style={{ marginTop: "0.75rem" }}
            >
              Log in to {banner.label}
            </a>
          </>
        ) : (
          // Desktop without the extension → get it (or shop manually on the banner's site).
          <>
            <p className="muted">
              You don't have the ordering extension installed. Install it (Chrome, desktop only) to
              send your list straight to your {banner.label} cart — or log in to {banner.label} to
              shop manually.
            </p>
            {EXTENSION_DOWNLOAD_URL ? (
              <a
                href={EXTENSION_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-primary btn-cta-wide"
              >
                Get extension
              </a>
            ) : (
              <button
                type="button"
                className="btn-primary btn-cta-wide"
                onClick={() => showToast("Extension download link coming soon.")}
              >
                Get extension
              </button>
            )}
            <a
              href={loginUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-cta-wide"
              style={{ marginTop: "0.75rem" }}
            >
              Log in to {banner.label}
            </a>
          </>
        )}
      </div>

      {handoffItems.length > 0 ? (
        <section className="detail-section">
          <h2 style={{ fontSize: "1rem", margin: "1rem 0 0.5rem" }}>
            Items ({handoffItems.length})
          </h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {handoffItems.map((it, i) => (
              <li
                key={`${it.term}-${i}`}
                style={{ padding: "0.4rem 0", borderBottom: "1px solid #f0f0f0" }}
              >
                {it.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
