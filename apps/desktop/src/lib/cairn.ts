/**
 * The desktop app's view of a cairn.
 *
 * Everything the UI renders comes through a `CairnSource`. There are exactly
 * two implementations:
 *
 *   - `TauriSource` (src/lib/tauri.ts) — the real thing: a repo on disk, read
 *     through Rust commands, verified by spawning the `cairn` CLI.
 *   - `DemoSource` (src/lib/demo.ts) — an in-memory cairn used when the app
 *     runs in a plain browser (`pnpm dev`), so every screen is reviewable
 *     without Tauri or a real repository.
 *
 * Stone files are parsed with @cairn/core's pure parser (`parseStoneFile`), the
 * same code the CLI and the MCP server use. There is no second parser here.
 */

import type { Stone, StoneStatus } from "@cairn/core/schema";

export type { Stone, StoneStatus };

/** A stone as the app holds it: frontmatter + intent body + where it lives. */
export interface StoneRecord {
  stone: Stone;
  /** Markdown body of the stone file = the intent, in the user's words. */
  body: string;
  /** POSIX path relative to the project root, e.g. `.cairn/stones/<ulid>.md`. */
  path: string;
}

export type RunVerdict = "green" | "red" | "skipped";

/**
 * One recorded proof run.
 *
 * Phase 1 stores no run journal in `.cairn/` — a stone only remembers its
 * `lastGreen`. So for a real repo this list holds the runs this app has
 * launched itself, plus one synthesised row per `lastGreen` (see
 * `runHistory()`). The demo source ships a fuller history on purpose.
 */
export interface RunRecord {
  id: string;
  stoneId: string | null;
  at: string;
  verdict: RunVerdict;
  durationMs: number;
  commit?: string;
  /** True when the row was derived from `lastGreen` rather than observed. */
  derived?: boolean;
}

/** The warden's structured report for a stone that ran out of attempts. */
export interface FailureReport {
  at: string;
  attempts: number;
  /** One-line verdict, in the warden's voice. */
  summary: string;
  expected: string;
  actual: string;
  /** The failing step of the proof, verbatim from the Playwright output. */
  step?: string;
  /** Repo-relative path to the Playwright trace, when one was kept. */
  trace?: string;
  /** Repo-relative path (or data URI) of the failure screenshot. */
  screenshot?: string;
  /** The diff the coder proposed on its last attempt. */
  diff?: string;
}

export interface CairnConfigView {
  baseURL: string;
  proofsDir: string;
  stonesDir: string;
  start?: string;
  setup?: string;
  retries: number;
}

/** Everything the app knows about one repo, read in one pass. */
export interface CairnSnapshot {
  root: string;
  /** Last path segment of the root — what the sidebar shows. */
  name: string;
  stones: StoneRecord[];
  /** Stone files that failed to parse; surfaced, never silently dropped. */
  unreadable: string[];
  config: CairnConfigView | null;
  runs: RunRecord[];
  /** Failure reports keyed by stone id. */
  reports: Record<string, FailureReport>;
  readAt: string;
}

export interface VerifyOptions {
  root: string;
  /** Empty = the whole cairn. */
  ids?: string[];
  /** The CI ratchet mode (`cairn verify --proven-only`). */
  provenOnly?: boolean;
}

export type VerifyEvent =
  | { type: "start"; runId: string; command: string }
  | { type: "line"; runId: string; line: string }
  | { type: "end"; runId: string; code: number };

export interface VerifyOutcome {
  runId: string;
  code: number;
  durationMs: number;
}

export interface CairnSource {
  readonly kind: "tauri" | "demo";
  /** Human label for the sidebar tag. */
  readonly label: string;
  /** Open the OS folder picker. Returns the chosen root, or null if cancelled. */
  pickRepo(): Promise<string | null>;
  /** Roots the source already knows about (the demo one, or none). */
  initialRepos(): string[];
  /** Read `.cairn/` in one pass: stones, proofs metadata, config. */
  readCairn(root: string): Promise<CairnSnapshot>;
  /** Read one proof file verbatim. Never written from the app. */
  readProof(root: string, proofPath: string): Promise<string>;
  /** Spawn `cairn verify`, streaming stdout/stderr lines through `onEvent`. */
  runVerify(options: VerifyOptions, onEvent: (event: VerifyEvent) => void): Promise<VerifyOutcome>;
  /** Watch `.cairn/` and call back (debounced) when it changes. */
  watch(root: string, onChange: () => void): Promise<() => void>;
}

/* ------------------------------------------------------------- selectors */

export const STATUS_ORDER: StoneStatus[] = [
  "draft",
  "escalated",
  "broken",
  "proven",
  "retired",
];

export function statusVar(status: StoneStatus): string {
  return `var(--status-${status})`;
}

export function countByStatus(stones: StoneRecord[]): Record<StoneStatus, number> {
  const counts: Record<StoneStatus, number> = {
    draft: 0,
    proven: 0,
    broken: 0,
    escalated: 0,
    retired: 0,
  };
  for (const record of stones) counts[record.stone.status] += 1;
  return counts;
}

export function byId(stones: StoneRecord[]): Map<string, StoneRecord> {
  return new Map(stones.map((record) => [record.stone.id, record]));
}

/**
 * Group stones into amendment chains. A chain is one visual object: the head
 * (the stone nothing amends) first, then every ancestor it supersedes.
 * Stones with no lineage come back as chains of one.
 */
export interface Chain {
  /** Newest stone first — index 0 is the current one. */
  stones: StoneRecord[];
}

export function buildChains(stones: StoneRecord[]): Chain[] {
  const index = byId(stones);
  const superseded = new Set<string>();
  for (const record of stones) {
    if (record.stone.amends) superseded.add(record.stone.amends);
  }

  const chains: Chain[] = [];
  for (const record of stones) {
    if (superseded.has(record.stone.id)) continue; // not a head, it belongs to a chain
    const chain: StoneRecord[] = [record];
    const seen = new Set<string>([record.stone.id]);
    let cursor: StoneRecord | undefined = record;
    while (cursor?.stone.amends) {
      const parent: StoneRecord | undefined = index.get(cursor.stone.amends);
      if (!parent || seen.has(parent.stone.id)) break;
      seen.add(parent.stone.id);
      chain.push(parent);
      cursor = parent;
    }
    chains.push({ stones: chain });
  }
  return chains;
}

/** The ancestors of a stone, oldest last. */
export function lineageOf(stones: StoneRecord[], id: string): StoneRecord[] {
  const index = byId(stones);
  const out: StoneRecord[] = [];
  const seen = new Set<string>([id]);
  let cursor = index.get(id);
  while (cursor?.stone.amends) {
    const parent = index.get(cursor.stone.amends);
    if (!parent || seen.has(parent.stone.id)) break;
    seen.add(parent.stone.id);
    out.push(parent);
    cursor = parent;
  }
  return out;
}

/**
 * Run history for one stone: observed runs first, plus the `lastGreen` row the
 * registry does remember. Marked `derived` so the UI can be honest about it.
 */
export function runHistory(snapshot: CairnSnapshot, stone: Stone): RunRecord[] {
  const observed = snapshot.runs.filter((run) => run.stoneId === stone.id);
  const rows = [...observed];
  const hasGreenRow =
    stone.lastGreen !== null &&
    observed.some((run) => run.verdict === "green" && run.at === stone.lastGreen?.at);
  if (stone.lastGreen && !hasGreenRow) {
    rows.push({
      id: `lastgreen-${stone.id}`,
      stoneId: stone.id,
      at: stone.lastGreen.at,
      verdict: "green",
      durationMs: 0,
      ...(stone.lastGreen.commit ? { commit: stone.lastGreen.commit } : {}),
      derived: true,
    });
  }
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Distinct surfaces present in a cairn, sorted. */
export function surfacesOf(stones: StoneRecord[]): string[] {
  const set = new Set<string>();
  for (const record of stones) {
    if (record.stone.surface) set.add(record.stone.surface);
  }
  return [...set].sort();
}

export function repoName(root: string): string {
  const parts = root.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || root;
}
