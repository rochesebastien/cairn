import { DemoSource } from "./demo.js";
import { TauriSource, isTauri } from "./tauri.js";
import type { CairnSource } from "./cairn.js";

/**
 * One source per process. Inside the Tauri webview the app talks to a real
 * repository; in a plain browser (`pnpm dev`) it falls back to the demo cairn
 * so every screen stays reviewable without a Rust toolchain.
 */
let cached: CairnSource | null = null;

export function getSource(): CairnSource {
  if (!cached) cached = isTauri() ? new TauriSource() : new DemoSource();
  return cached;
}
