import { Link } from "react-router-dom";
import "./kroger.css";

/**
 * "Place order" chooser: the user picks which grocer to send their shopping list to, then we
 * route to that retailer's flow. Kroger brand → the official Kroger API flow ({@link KrogerOrderPage},
 * whose store picker covers Ralphs, Fred Meyer & other Kroger banners). Safeway brand → the
 * companion browser-extension flow ({@link SafewayOrderPage}).
 */
export function PlaceOrderPage() {
  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to="/shopping" className="back-btn" aria-label="Go back to shopping list">
          Go back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Place order
        </h1>
      </div>

      <div className="kroger-card">
        <h2>Where do you want to shop?</h2>
        <p className="muted">Send your shopping list to a grocer to review and check out.</p>

        <Link to="/order/kroger" className="btn-primary btn-cta-wide">
          Kroger brand
        </Link>
        <p className="kroger-note" style={{ marginTop: "0.25rem" }}>
          Kroger, Ralphs, Fred Meyer and other Kroger banners. Connect your account; items go to
          your Kroger cart.
        </p>

        <Link to="/order/safeway" className="btn-secondary btn-cta-wide" style={{ marginTop: "1rem" }}>
          Safeway brand
        </Link>
        <p className="kroger-note" style={{ marginTop: "0.25rem" }}>
          Safeway, Vons or Pavilions — via the desktop browser extension (or a screenshot on mobile).
          You'll pick which store next.
        </p>
      </div>
    </div>
  );
}
