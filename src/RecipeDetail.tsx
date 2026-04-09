import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { IngredientDef, Recipe, RecommendedSideRef } from "./types";
import { formatIngredientLine, ingredientMap } from "./ingredientDisplay";
import {
  homeListPath,
  readSidesListTab,
  recipeDetailPath,
  shoppingListPath,
} from "./listTabSearch";
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
  const [searchParams] = useSearchParams();
  const fromSidesList = readSidesListTab(searchParams);
  const recipe = recipes.find((r) => r.id === id);
  const { listQuantity, addToList, removeFromList, count } = useShoppingList();
  const byId = React.useMemo(() => ingredientMap(ingredients), [ingredients]);

  if (!recipe) {
    return (
      <>
        <div className="top-bar">
          <Link to={homeListPath(fromSidesList)} className="back-btn">
            ← Back
          </Link>
        </div>
        <p className="empty">Recipe not found.</p>
      </>
    );
  }

  const onListQty = listQuantity(recipe.id);

  const recommended = recipe.recommendedSides ?? [];
  const sideRefs = React.useMemo(() => {
    const map = new Map<string, RecommendedSideRef>();
    for (const ref of recommended) {
      if (!map.has(ref.recipeId)) {
        map.set(ref.recipeId, ref);
      }
    }
    return [...map.entries()].map(([recipeId, ref]) => ({
      recipeId,
      label: ref.label,
      recipe: recipes.find((r) => r.id === recipeId),
    }));
  }, [recommended, recipes]);

  return (
    <>
      <div className="top-bar">
        <Link to={homeListPath(fromSidesList)} className="back-btn">
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

      {sideRefs.length > 0 ? (
        <section className="detail-section recommended-sides-section">
          <h2>Recommended sides</h2>
          <p className="muted recommended-sides-intro">
            Open a side for full prep instructions. Add to your shopping list only if you want
            those ingredients merged in.
          </p>
          <ul className="recommended-sides-list">
            {sideRefs.map(({ recipeId, label, recipe: sideRecipe }) => {
              const sideQty = listQuantity(recipeId);
              return (
                <li key={recipeId} className="recommended-side-card">
                  <div className="recommended-side-head">
                    {sideRecipe ? (
                      <Link
                        to={recipeDetailPath(recipeId, fromSidesList)}
                        className="recommended-side-title"
                      >
                        {sideRecipe.title}
                      </Link>
                    ) : (
                      <span className="recommended-side-title missing-side">
                        Missing recipe: {recipeId}
                      </span>
                    )}
                    {sideRecipe ? (
                      sideQty > 0 ? (
                        <div className="recommended-side-qty-btns">
                          <button
                            type="button"
                            className="btn-primary btn-compact"
                            onClick={() => addToList(recipeId)}
                          >
                            + Add
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-compact"
                            onClick={() => removeFromList(recipeId)}
                          >
                            − One ({sideQty})
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary btn-compact"
                          onClick={() => addToList(recipeId)}
                        >
                          Add to list
                        </button>
                      )
                    ) : null}
                  </div>
                  {label ? <p className="muted recommended-side-label">{label}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
        {onListQty > 0 ? (
          <div className="cta-panel-actions">
            <button
              type="button"
              className="btn-primary btn-cta-wide"
              onClick={() => addToList(recipe.id)}
            >
              Add another to shopping list
            </button>
            <button
              type="button"
              className="btn-secondary btn-cta-wide"
              onClick={() => removeFromList(recipe.id)}
            >
              Remove one ({onListQty} on list)
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary btn-cta-wide"
            onClick={() => addToList(recipe.id)}
          >
            Add to shopping list
          </button>
        )}
        <Link to={shoppingListPath(fromSidesList)} className="cta-sub-link">
          View shopping list{count > 0 ? ` (${count})` : ""}
        </Link>
      </div>
    </>
  );
}
