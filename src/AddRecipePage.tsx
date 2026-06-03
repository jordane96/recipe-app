import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Recipe } from "./types";

type Tab = "paste" | "screenshot" | "url";

export function AddRecipePage() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<Tab>("paste");
  const [pasteText, setPasteText] = React.useState("");
  const [urlText, setUrlText] = React.useState("");
  const [imageFiles, setImageFiles] = React.useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSubmit =
    !loading &&
    (tab === "paste"
      ? pasteText.trim().length > 0
      : tab === "screenshot"
        ? imageFiles.length > 0
        : /^https?:\/\/.+/i.test(urlText.trim()));

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setImageFiles((prev) => [...prev, ...imgs]);
    setImagePreviewUrls((prev) => [...prev, ...imgs.map((f) => URL.createObjectURL(f))]);
    setError(null);
  }

  function removeImageAt(index: number) {
    setImagePreviewUrls((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }

  async function handleParse() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      let body: Record<string, unknown>;

      if (tab === "paste") {
        body = { text: pasteText };
      } else if (tab === "url") {
        body = { url: urlText.trim() };
      } else {
        const images = await Promise.all(
          imageFiles.map(async (f) => ({ imageBase64: await fileToBase64(f), mimeType: f.type })),
        );
        body = { images };
      }

      const res = await fetch("/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Something went wrong — try again.");
        return;
      }

      const draft = await res.json() as Recipe;
      navigate("/recipe/new/edit", { state: { parsedDraft: draft } });
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="add-recipe-page">
      <div className="add-recipe-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "paste"}
          className="add-recipe-tab"
          data-on={tab === "paste"}
          onClick={() => { setTab("paste"); setError(null); }}
        >
          Paste text
        </button>
        <button
          role="tab"
          aria-selected={tab === "screenshot"}
          className="add-recipe-tab"
          data-on={tab === "screenshot"}
          onClick={() => { setTab("screenshot"); setError(null); }}
        >
          Share photo
        </button>
        <button
          role="tab"
          aria-selected={tab === "url"}
          className="add-recipe-tab"
          data-on={tab === "url"}
          onClick={() => { setTab("url"); setError(null); }}
        >
          Link URL
        </button>
      </div>

      {tab === "paste" && (
        <div className="add-recipe-panel">
          <textarea
            className="add-recipe-textarea"
            placeholder="Paste a recipe here — ingredients, instructions, whatever you have. The more detail the better."
            value={pasteText}
            onChange={(e) => { setPasteText(e.target.value); setError(null); }}
            rows={10}
          />
        </div>
      )}

      {tab === "screenshot" && (
        <div className="add-recipe-panel">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {imagePreviewUrls.length > 0 ? (
            <>
              <div className="add-recipe-photo-grid">
                {imagePreviewUrls.map((url, i) => (
                  <div key={url} className="add-recipe-photo-thumb">
                    <img src={url} alt={`Recipe photo ${i + 1}`} />
                    <button
                      type="button"
                      className="add-recipe-photo-remove"
                      onClick={() => removeImageAt(i)}
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="add-recipe-photo-add"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add more photos"
                >
                  <span className="add-recipe-photo-add-plus" aria-hidden>
                    +
                  </span>
                  <span className="add-recipe-photo-add-label">Add more</span>
                </button>
              </div>
              <p className="add-recipe-upload-sub">
                {imagePreviewUrls.length === 1
                  ? "1 photo"
                  : `${imagePreviewUrls.length} photos`}{" "}
                — combined into one recipe.
              </p>
            </>
          ) : (
            <div
              className="add-recipe-upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="add-recipe-upload-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <p className="add-recipe-upload-label">Drop photos here</p>
              <p className="add-recipe-upload-sub">
                One or more photos/screenshots of a recipe
              </p>
              <span className="add-recipe-upload-browse">Browse files</span>
            </div>
          )}
        </div>
      )}

      {tab === "url" && (
        <div className="add-recipe-panel">
          <input
            className="add-recipe-url-input"
            type="url"
            inputMode="url"
            placeholder="https://www.allrecipes.com/recipe/…"
            value={urlText}
            onChange={(e) => { setUrlText(e.target.value); setError(null); }}
            aria-label="Recipe URL to import"
          />
        </div>
      )}

      {error && (
        <p className="add-recipe-error" role="alert">
          {error}
        </p>
      )}

      <div className="add-recipe-actions">
        <div className="add-recipe-cta-stack">
          <button
            className="btn-primary btn-cta-wide"
            disabled={!canSubmit}
            onClick={handleParse}
          >
            {loading ? "Reading recipe…" : "Import recipe"}
          </button>
          <Link to="/recipes" className="btn-secondary btn-cta-wide">
            Back
          </Link>
        </div>
        <Link to="/recipe/new/edit" className="add-recipe-blank-link">
          Start with blank recipe
        </Link>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
