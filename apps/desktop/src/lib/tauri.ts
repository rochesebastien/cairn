/**
 * TauriSource — the real cairn: a repository on disk.
 *
 * Reads go through Rust commands (`pick_repo`, `read_cairn`, `read_proof`),
 * proofs are replayed by spawning the `cairn` CLI (`run_verify`, streaming its
 * stdout as events), and `.cairn/` is watched with `notify` so the app
 * refreshes when the warden writes.
 *
 * The stone files come back as raw text and are parsed here with @cairn/core's
 * `parseStoneFile` — same parser as the CLI and the MCP server.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { parseStoneFile } from "@cairn/core/stone-parse";
import type {
  CairnConfigView,
  CairnSnapshot,
  CairnSource,
  StoneRecord,
  VerifyEvent,
  VerifyOptions,
  VerifyOutcome,
} from "./cairn.js";
import { repoName } from "./cairn.js";

/** True when the page is running inside the Tauri webview. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface FileEntry {
  /** POSIX path, relative to the project root. */
  path: string;
  content: string;
}

interface CairnFiles {
  root: string;
  configPath: string | null;
  configSource: string | null;
  stones: FileEntry[];
  proofs: string[];
  unreadable: string[];
}

interface VerifyLineEvent {
  runId: string;
  line: string;
  stream: "stdout" | "stderr";
}

interface VerifyEndEvent {
  runId: string;
  code: number;
}

/**
 * Best-effort read of `cairn.config.ts`. The CLI is the authority — it
 * evaluates the file with jiti — so this only picks the literal fields off the
 * source to fill the header, and gives up quietly when they are computed.
 */
export function parseConfigSource(source: string | null): CairnConfigView | null {
  if (!source) return null;
  const str = (key: string): string | undefined => {
    const match = new RegExp(`\\b${key}\\s*:\\s*["'\`]([^"'\`]*)["'\`]`).exec(source);
    return match?.[1];
  };
  const num = (key: string): number | undefined => {
    const match = new RegExp(`\\b${key}\\s*:\\s*(\\d+)`).exec(source);
    return match ? Number(match[1]) : undefined;
  };
  const baseURL = str("baseURL");
  if (!baseURL) return null;
  const start = str("start");
  const setup = str("setup");
  return {
    baseURL,
    proofsDir: str("proofsDir") ?? ".cairn/proofs",
    stonesDir: str("stonesDir") ?? ".cairn/stones",
    ...(start ? { start } : {}),
    ...(setup ? { setup } : {}),
    retries: num("retries") ?? 0,
  };
}

export class TauriSource implements CairnSource {
  readonly kind = "tauri" as const;
  readonly label = "local";

  async pickRepo(): Promise<string | null> {
    return invoke<string | null>("pick_repo");
  }

  initialRepos(): string[] {
    return [];
  }

  async readCairn(root: string): Promise<CairnSnapshot> {
    const files = await invoke<CairnFiles>("read_cairn", { root });
    const stones: StoneRecord[] = [];
    const unreadable = [...files.unreadable];

    for (const file of files.stones) {
      try {
        const parsed = parseStoneFile(file.content, file.path);
        stones.push({ stone: parsed.stone, body: parsed.body, path: file.path });
      } catch (error) {
        unreadable.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    stones.sort((a, b) => (a.stone.id < b.stone.id ? -1 : 1));

    return {
      root: files.root,
      name: repoName(files.root),
      stones,
      unreadable,
      config: parseConfigSource(files.configSource),
      // Phase 1 keeps no run journal in `.cairn/` — only `lastGreen` per stone.
      // Observed runs are the ones this app launches; see runHistory().
      runs: [],
      // No warden report is persisted yet either. The escalations view says so.
      reports: {},
      readAt: new Date().toISOString(),
    };
  }

  async readProof(root: string, proofPath: string): Promise<string> {
    return invoke<string>("read_proof", { root, proofPath });
  }

  async runVerify(
    options: VerifyOptions,
    onEvent: (event: VerifyEvent) => void,
  ): Promise<VerifyOutcome> {
    const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const started = Date.now();

    // Listeners first: the process starts writing as soon as `run_verify`
    // returns, and lines emitted before we subscribe would be lost.
    const stopLines = await listen<VerifyLineEvent>("cairn-verify-line", (event) => {
      if (event.payload.runId !== runId) return;
      onEvent({ type: "line", runId, line: event.payload.line });
    });

    let stopEnd = (): void => {};
    const ended = new Promise<number>((resolve) => {
      void listen<VerifyEndEvent>("cairn-verify-end", (event) => {
        if (event.payload.runId !== runId) return;
        resolve(event.payload.code);
      }).then((unlisten) => {
        stopEnd = unlisten;
      });
    });

    try {
      const command = await invoke<string>("run_verify", {
        runId,
        root: options.root,
        ids: options.ids ?? [],
        provenOnly: options.provenOnly ?? false,
      });
      onEvent({ type: "start", runId, command });
      const code = await ended;
      onEvent({ type: "end", runId, code });
      return { runId, code, durationMs: Date.now() - started };
    } finally {
      stopLines();
      stopEnd();
    }
  }

  async watch(root: string, onChange: () => void): Promise<() => void> {
    await invoke("watch_cairn", { root });
    const unlisten = await listen<{ root: string }>("cairn-changed", (event) => {
      if (event.payload.root === root) onChange();
    });
    return () => {
      unlisten();
      void invoke("unwatch_cairn", { root }).catch(() => {
        /* the window is going away anyway */
      });
    };
  }
}
