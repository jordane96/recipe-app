import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production: use `.env.production` → `VITE_BASE_PATH` for GitHub Enterprise Pages
 * (e.g. /pages/USER/REPO/). Fallback `./` when unset.
 */
export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, process.cwd(), "");
  const fromEnv =
    (loaded.VITE_BASE_PATH ?? process.env.VITE_BASE_PATH)?.trim() ?? "";
  const base =
    fromEnv.length > 0
      ? fromEnv.replace(/\/?$/, "/")
      : mode === "production"
        ? "./"
        : "/";

  return {
    base,
    plugins: [react()],
  };
});
