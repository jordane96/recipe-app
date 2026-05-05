import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Production: `./` + runtime <base href> in index.html (see comment there) so the app works on
 * any GitHub / GHE Pages path without hard-coding it.
 */
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "./" : "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
}));
