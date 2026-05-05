import { Link } from "react-router-dom";

export function DiscoverPlaceholderPage() {
  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to="/recipes" className="back-btn">
          Recipes
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Discover
        </h1>
      </div>
      <p className="recipe-experience-tbd-msg">Discover experience TBD</p>
    </div>
  );
}
