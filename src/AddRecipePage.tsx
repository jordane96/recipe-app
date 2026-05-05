import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Recipe } from "./types";

type Tab = "paste" | "screenshot";

export function AddRecipePage() {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<Tab>("paste");
  const [pasteText, setPasteText] = React.useState("");
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSubmit =
    !loading && (tab === "paste" ? pasteText.trim().length > 0 : imageFile != null);

  function handleFileChange(file: File | null) {
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    setError(null);
  }

  function removeImage() {
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) handleFileChange(file);
  }

  async function handleParse() {
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    try {
      let body: Record<string, string>;

      if (tab === "paste") {
        body = { text: pasteText };
      } else {
        const imageBase64 = await fileToBase64(imageFile!);
        body = { imageBase64, mimeType: imageFile!.type };
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
      <div className="top-bar">
        <Link to="/recipes" className="back-btn">
          Recipes
        </Link>
        <h1 className="page-title" style={{ fontSize: "1.25rem" }}>
          Add recipe
        </h1>
      </div>

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
          Screenshot
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
          {imagePreviewUrl ? (
            <div className="add-recipe-preview">
              <img src={imagePreviewUrl} alt="Recipe screenshot" />
              <button
                className="add-recipe-preview-remove"
                onClick={removeImage}
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ) : (
            <div
              className="add-recipe-upload-zone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              <div className="add-recipe-upload-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <p className="add-recipe-upload-label">Drop a screenshot here</p>
              <p className="add-recipe-upload-sub">
                Photo of a recipe, cookbook page, or app screenshot
              </p>
              <span className="add-recipe-upload-browse">Browse files</span>
            </div>
          )}
        </div>
      )}

      <div className="add-recipe-url-section">
        <div className="add-recipe-url-label">
          Import from URL
          <span className="add-recipe-badge-soon">Coming soon</span>
        </div>
        <input
          className="add-recipe-url-input"
          type="url"
          placeholder="https://..."
          disabled
          aria-label="Import from URL (coming soon)"
        />
      </div>

      {error && (
        <p className="add-recipe-error" role="alert">
          {error}
        </p>
      )}

      <div className="add-recipe-actions">
        <button
          className="btn-primary"
          disabled={!canSubmit}
          onClick={handleParse}
        >
          {loading ? "Reading recipe…" : "Parse recipe"}
        </button>
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
