import * as React from "react";
import { Link, useParams } from "react-router-dom";
import type { IngredientDef, Recipe } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import { recipeSegment } from "./recipeCourse";
import { useShoppingList } from "./ShoppingListContext";

export function RecipeDetail({
  recipes,
  ingredients,
}: {
  recipes: Recipe[];
  ingredients: IngredientDef[];
}) {
  const { id } = useParams();
  const recipe = recipes.find((r) => r.id === id);
  const { isSelected, addToList, removeFromList, count } = useShoppingList();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  if (!recipe) {
    return (
      <>
        <div className="top-bar">
          <Link to="/" className="back-btn">
            ← Back
          </Link>
        </div>
        <p className="empty">Recipe not found.</p>
      </>
    );
  }

  const onList = isSelected(recipe.id);

  return (
    <>
      <div className="top-bar">
        <Link to="/" className="back-btn">
          ← Back
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          {recipe.title}
          {recipe.type === "reference" ? (
            <span className="badge">Reference</span>
          ) : null}
          {recipeSegment(recipe) === "side" ? (
            <span className="badge badge-side">Side</span>
          ) : null}
        </h1>
      </div>
      {recipe.tags && recipe.tags.length > 0 ? (
        <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {recipe.tags.join(" · ")}
        </p>
      ) : null}

      {recipe.ingredientSections?.map((sec) => (
        <section key={sec.name} className="detail-section">
          <h2>{sec.name}</h2>
          {sec.lines.length === 0 ? (
            <p className="muted">No structured ingredients (see instructions).</p>
          ) : (
            <ul>
              {sec.lines.map((line, i) => (
                <li key={`${line.ingredientId}-${i}`}>
                  {formatIngredientLine(line, byId)}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {recipe.instructions && recipe.instructions.length > 0 ? (
        <section className="detail-section">
          <h2>Instructions</h2>
          <ol className="steps">
            {recipe.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {recipe.sourceUrl ? (
        <p className="detail-section">
          <a
            className="source-link"
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Original recipe ↗
          </a>
        </p>
      ) : null}

      {recipe.notes ? (
        <p className="muted detail-section">{recipe.notes}</p>
      ) : null}

      <div className="cta-panel cta-panel-bottom">
        <button
          type="button"
          className={onList ? "btn-secondary btn-cta-wide" : "btn-primary btn-cta-wide"}
          onClick={() => (onList ? removeFromList(recipe.id) : addToList(recipe.id))}
        >
          {onList ? "Remove from shopping list" : "Add to shopping list"}
        </button>
        <Link to="/shopping" className="cta-sub-link">
          View shopping list{count > 0 ? ` (${count})` : ""}
        </Link>
      </div>
    </>
  );
}
