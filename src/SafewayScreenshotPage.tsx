import { Link } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { useBuyItems } from "./useBuyItems";

/**
 * A deliberately dense, single-screen list of every shopping item, so a phone user can capture
 * the WHOLE list in one screenshot and upload it to Safeway's "Import from List" (Safeway accepts
 * only one image). Small type + tight leading maximizes how many items fit above the fold.
 */
export function SafewayScreenshotPage({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const buyItems = useBuyItems(recipes, ingredients);

  return (
    <div className="recipe-list-page">
      <div className="top-bar">
        <Link to="/order/safeway" className="back-btn" aria-label="Back to Safeway ordering">
          Go back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Screenshot list
        </h1>
      </div>

      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
        Screenshot this entire list, then in the Safeway app tap <strong>Import from List</strong>{" "}
        and upload it. It's condensed so the whole list fits in one image.
      </p>

      {buyItems.length === 0 ? (
        <p className="muted">Your shopping list is empty.</p>
      ) : (
        <div
          style={{
            background: "#ffffff",
            color: "#111111",
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #ddd",
          }}
        >
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              fontSize: "12px",
              lineHeight: 1.3,
            }}
          >
            {buyItems.map((it, i) => (
              <li key={`${it.key}-${i}`} style={{ padding: "1px 0" }}>
                {it.label}
                {it.notes.length > 0 ? ` (${it.notes.join(", ")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
