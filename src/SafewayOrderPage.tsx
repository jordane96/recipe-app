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

/**
 * Safeway ordering. Unlike Kroger (official API, see {@link KrogerOrderPage}), Safeway has no
 * public cart API, so this page hands the list to the companion browser extension, which fills
 * the cart from the user's own logged-in safeway.com session. Desktop Chrome only.
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
  const extPresent = extStatus === "present";

  const handoffItems: SafewayHandoffItem[] = React.useMemo(
    () => buyItems.map((it) => ({ term: it.name, label: it.label, qty: 1, notes: it.notes })),
    [buyItems],
  );

  const [sent, setSent] = React.useState(false);
  const sendToSafeway = React.useCallback(() => {
    if (handoffItems.length === 0) return;
    publishSafewayHandoff(handoffItems);
    setSent(true);
    showToast(
      extPresent
        ? "Sent to Safeway — opening a Safeway tab to fill your cart."
        : "List published. Install the Safeway extension to fill your cart.",
    );
  }, [handoffItems, extPresent, showToast]);

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
        <p className="muted">
          Safeway has no ordering API, so this uses the companion browser extension: it opens
          Safeway in your logged-in session, searches each item, and lets you review and add
          everything to your cart. You finish checkout on Safeway. Desktop Chrome only.
        </p>
        {extStatus === "present" ? (
          <p className="muted" style={{ color: "var(--ok, #1a7f37)" }}>
            ✓ Safeway extension detected.
          </p>
        ) : extStatus === "stale" ? (
          <p className="muted" style={{ color: "#a4160f" }}>
            ⚠ The extension was reloaded — refresh this page (Ctrl+F5) to reconnect, then press
            Send again.
          </p>
        ) : (
          <p className="muted">
            Extension not detected. See <code>safeway-extension/README.md</code> to install it,
            or copy the list and paste into Safeway search manually.
          </p>
        )}

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
          disabled={handoffItems.length === 0}
          onClick={() => void copyList()}
        >
          Copy list
        </button>
        {sent && !extPresent ? (
          <p className="kroger-note">
            The list is published on this page. Once the extension is installed, reopen this page
            and press “Send” again.
          </p>
        ) : null}
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
