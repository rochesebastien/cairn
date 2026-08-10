/**
 * Cairn configuration for the desktop review app — the first dogfooded surface.
 *
 * Loaded by `cairn verify` through jiti, so TypeScript needs no build step.
 * Proofs run against the browser build (`pnpm dev`), which serves the app
 * against the in-memory demo cairn: deterministic data, no Rust, no repository.
 */
export default {
  /**
   * How to start the app the proofs run against. Cairn does not start it
   * itself: it exports the command as CAIRN_START (and baseURL as
   * CAIRN_BASE_URL) so playwright.config.ts owns the lifecycle.
   */
  start: "pnpm dev",

  /** Vite dev server, strictPort — see vite.config.ts. */
  baseURL: "http://127.0.0.1:5183",

  /** Proofs are meant to be deterministic: no retries. */
  retries: 0,

  /** Where stones and proofs live. Both are relative to this file. */
  stonesDir: ".cairn/stones",
  proofsDir: ".cairn/proofs",
};
