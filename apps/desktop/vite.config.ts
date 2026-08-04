import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite config for the Cairn desktop app.
 *
 * `pnpm dev` serves the app in a plain browser against the in-memory demo
 * cairn; `pnpm tauri:dev` points the Tauri shell at the same server.
 */
export default defineConfig({
  plugins: [react()],
  // Tauri serves the built assets from a file:// style origin, so keep the
  // paths relative.
  base: "./",
  clearScreen: false,
  server: {
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: true,
    emptyOutDir: true,
  },
});
