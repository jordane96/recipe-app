import * as React from "react";
import { Link } from "react-router-dom";
import type { Recipe } from "./types";

function uniqueTags(recipes: Recipe[]): string[] {
  const s = new Set<string>();
  for (const r of recipes) {
    for (const t of r.tags ?? []) {
      s.add(t);
    }
  }
  return [...s].sort((a, b) => a.localeCompare(b));
}

function matches(
  recipe: Recipe,
  q: string,
  tag: string | null,
): boolean {
  if (tag && !(recipe.tags?.includes(tag))) {
    return false;
  }
  if (!q.trim()) {
    return true;
  }
  const needle = q.trim().toLowerCase();
  if (recipe.title.toLowerCase().includes(needle)) {
    return true;
  }
  for (const sec of recipe.sections ?? []) {
    if (sec.name.toLowerCase().includes(needle)) {
      return true;
    }
    for (const line of sec.items) {
      if (line.toLowerCase().includes(needle)) {
        return true;
      }
    }
  }
  for (const line of recipe.instructions ?? []) {
    if (line.toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const tags = uniqueTags(recipes);
  const filtered = recipes
    .filter((r) => matches(r, q, tag))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <>
      <h1 className="page-title">Recipes</h1>
      <input
        className="search"
        type="search"
        placeholder="Search titles, ingredients, steps…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
      />
      {tags.length > 0 ? (
        <div className="tag-row" role="toolbar" aria-label="Filter by tag">
          <button
            type="button"
            className="tag-chip"
            data-on={tag === null}
            onClick={() => setTag(null)}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              className="tag-chip"
              data-on={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
      {filtered.length === 0 ? (
        <p className="empty">No recipes match.</p>
      ) : (
        <ul className="recipe-list">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link className="recipe-link" to={`/recipe/${r.id}`}>
                <span className="recipe-title-row">
                  <span>{r.title}</span>
                  {r.type === "reference" ? (
                    <span className="badge">Reference</span>
                  ) : null}
                </span>
                {r.tags && r.tags.length > 0 ? (
                  <span className="meta">{r.tags.join(" · ")}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
