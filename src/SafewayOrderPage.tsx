import * as React from "react";
import { Link } from "react-router-dom";
import "./kroger.css";
import type { IngredientDef, Recipe } from "./types";
import { useBuyItems } from "./useBuyItems";
import { useToast } from "./ToastContext";
import {
  getSafewayExtensionStatus,
  publishSafewayHandoff,
  type SafewayHandoffItem,
} from "./safewayHandoff";
import { isLikelyMobile } from "./deviceType";

/**
 * Where to download the packed Safeway ordering extension (Chrome, desktop). TODO: set this to
 * the hosted link (e.g. a Google Drive share) once the build is published; until then the
 * "Get extension" button just tells the user it's coming.
 */
const EXTENSION_DOWNLOAD_URL = "";

/**
 * Safeway ordering. Unlike Kroger (official API, see {@link KrogerOrderPage}), Safeway has no
 * public cart API, so this page hands the list to the companion browser extension, which fills
 * the cart from the user's own logged-in safeway.com session. Desktop Chrome only. When the
 * extension is absent, guidance splits by device (see {@link isLikelyMobile}).
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
    () => buyItems.map((it) => ({ term: it.name, label: it.label, qty: 1, notes: it.notes })),
    [buyItems],
  );

  const sendToSafeway = React.useCallback(() => {
    if (handoffItems.length === 0) return;
    publishSafewayHandoff(handoffItems);
    showToast("Sent to Safeway — opening a Safeway tab to fill your cart.");
  }, [handoffItems, showToast]);

  const copyList = React.useCallback(async () => {
    const text = handoffItems.map((it) => it.term).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied the list to your clipboard.");
    } catch {
      showToast("Couldn't access the clipboard.");
    }
  }, [handoffItems, showToast]);

  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to="/shopping" className="back-btn" aria-label="Go back to shopping list">
          Go back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Order from Safeway
        </h1>
      </div>

      <div className="kroger-card">
        <h2>Send this list to Safeway</h2>
        {extStatus === "present" ? (
          // Desktop with the extension installed → send straight to the cart.
          <>
            <p className="muted" style={{ color: "var(--ok, #1a7f37)" }}>
              ✓ Safeway extension detected.
            </p>
            <p className="muted">
              Press Send below — it opens Safeway in your logged-in session, matches each item, and
              lets you review and add everything to your cart. You finish checkout on Safeway.
            </p>
            <button
              type="button"
              className="btn-primary btn-cta-wide"
              disabled={handoffItems.length === 0}
              onClick={sendToSafeway}
            >
              {handoffItems.length === 0
                ? "Your shopping list is empty"
                : `Send ${handoffItems.length} item${handoffItems.length === 1 ? "" : "s"} to Safeway`}
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
          // Phone → screenshot the whole list into one image for Safeway's "Import from List".
          <>
            <p className="muted">
              To order from Safeway on your phone: screenshot your full list, then upload it to
              Safeway's <strong>Import from List</strong>. Safeway accepts only one screenshot, so
              we fit your whole list into a single image.
            </p>
            <Link to="/order/safeway/screenshot" className="btn-primary btn-cta-wide">
              Get screenshot
            </Link>
            <a
              href="https://www.safeway.com"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-cta-wide"
              style={{ marginTop: "0.75rem" }}
            >
              Log in to Safeway
            </a>
          </>
        ) : (
          // Desktop without the extension → get it (or shop manually on safeway.com).
          <>
            <p className="muted">
              You don't have the Safeway ordering extension installed. Install it (Chrome, desktop
              only) to send your list straight to your Safeway cart — or log in to Safeway to shop
              manually.
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
              href="https://www.safeway.com"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary btn-cta-wide"
              style={{ marginTop: "0.75rem" }}
            >
              Log in to Safeway
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
