import { Link, useParams } from "react-router-dom";
import type { Recipe } from "./types";

export function RecipeDetail({ recipes }: { recipes: Recipe[] }) {
  const { id } = useParams();
  const recipe = recipes.find((r) => r.id === id);

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
        </h1>
      </div>
      {recipe.tags && recipe.tags.length > 0 ? (
        <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          {recipe.tags.join(" · ")}
        </p>
      ) : null}

      {recipe.sections?.map((sec) => (
        <section key={sec.name} className="detail-section">
          <h2>{sec.name}</h2>
          <ul>
            {sec.items.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
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
    </>
  );
}
