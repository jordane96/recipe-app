import { Link } from "react-router-dom";

export function InstacartPlaceholderPage() {
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
      <p className="recipe-experience-tbd-msg">Instacart Connection TBD</p>
    </div>
  );
}
