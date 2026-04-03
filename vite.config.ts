import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production: relative `./` so assets work on GitHub Pages (project site or user site).
 * Override: VITE_BASE_PATH=/recipe-app/ if needed.
 */
export default defineConfig(({ mode }) => {
  const fromEnv = process.env.VITE_BASE_PATH?.trim();
  const base =
    fromEnv && fromEnv.length > 0
      ? fromEnv.replace(/\/?$/, "/")
      : mode === "production"
        ? "./"
        : "/";

  return {
    base,
    plugins: [react()],
  };
});
