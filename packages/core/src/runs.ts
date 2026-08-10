import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { isoDateSchema, ulidSchema } from "./schema.js";

/**
 * The measurement ledger: `.cairn/runs/<ulid>.jsonl`, one line per event.
 *
 * A stone says what the loop promised; the ledger says what the loop cost.
 * One `run` line per proof attempt, one `escalate` line when the budget is
 * spent, one `amend` line when the stone is superseded. It is append-only,
 * JSONL so a truncated write costs one line and not the file, and it stays
 * **out of git**: it is local (and CI-artifact) evidence. The durable summary
 * that does get committed is `provenance.attempts` / `provenance.tokens` on
 * the stone, stamped on escalate and amend.
 */

export const RUNS_DIR_NAME = "runs";
export const RUN_LEDGER_EXTENSION = ".jsonl";
export const DEFAULT_RUNS_DIR = ".cairn/runs";

/** What a proof run reported. `missing` is not a run: it never reaches here. */
export const RUN_RESULTS = ["green", "red"] as const;
export const runResultSchema = z.enum(RUN_RESULTS);
export type RunResult = z.infer<typeof runResultSchema>;

/** Who appended the line. */
export const RUN_SOURCES = ["verify", "mcp"] as const;
export const runSourceSchema = z.enum(RUN_SOURCES);
export type RunSource = z.infer<typeof runSourceSchema>;

export const runAttemptEventSchema = z.object({
  kind: z.literal("run"),
  at: isoDateSchema,
  result: runResultSchema,
  /** 1-based, numbered from the lines already in the ledger. */
  attempt: z.number().int().min(1),
  commit: z.string().optional(),
  /** sha256 of the proof as it was run. */
  proofHash: z.string().optional(),
  /** True when the proof changed since the previous attempt. */
  proofEdited: z.boolean().optional(),
  tokens: z.number().int().nonnegative().optional(),
  source: runSourceSchema.optional(),
});

export const escalateEventSchema = z.object({
  kind: z.literal("escalate"),
  at: isoDateSchema,
  attempts: z.number().int().nonnegative().optional(),
  tokens: z.number().int().nonnegative().optional(),
});

export const amendEventSchema = z.object({
  kind: z.literal("amend"),
  at: isoDateSchema,
  amendedBy: ulidSchema,
});

export const runEventSchema = z.discriminatedUnion("kind", [
  runAttemptEventSchema,
  escalateEventSchema,
  amendEventSchema,
]);

export type RunAttemptEvent = z.infer<typeof runAttemptEventSchema>;
export type EscalateEvent = z.infer<typeof escalateEventSchema>;
export type AmendEvent = z.infer<typeof amendEventSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
export type RunEventInput = z.input<typeof runEventSchema>;

export function parseRunEvent(value: unknown): RunEvent {
  return runEventSchema.parse(value);
}

export function safeParseRunEvent(value: unknown) {
  return runEventSchema.safeParse(value);
}

/* ------------------------------------------------------------------ paths */

/**
 * The runs directory of a cairn: a sibling of the stones directory, so a
 * project that moved `stonesDir` to `registry/stones` gets `registry/runs`.
 */
export function runsDirFor(stonesDir: string): string {
  return path.join(path.dirname(stonesDir), RUNS_DIR_NAME);
}

export function runLedgerName(id: string): string {
  return `${id}${RUN_LEDGER_EXTENSION}`;
}

export function runLedgerPathFor(stonesDir: string, id: string): string {
  return path.join(runsDirFor(stonesDir), runLedgerName(id));
}

/* ------------------------------------------------------- serialize / parse */

/** One event, one line. Zod orders the fields, so the file stays diff-stable. */
export function serializeRunEvent(event: RunEvent | RunEventInput): string {
  return `${JSON.stringify(runEventSchema.parse(event))}\n`;
}

export interface ParsedRunLedger {
  events: RunEvent[];
  /** Lines that were neither blank nor a valid event. Counted, never guessed. */
  skipped: number;
}

/**
 * Parse a ledger file tolerantly. A ledger is evidence appended by several
 * processes over months: a half-written last line (a killed CI job) must cost
 * that line and nothing else. Blank lines are not corruption and are ignored;
 * anything else that fails to parse is counted so callers can say so.
 */
export function parseRunLedger(content: string): ParsedRunLedger {
  const events: RunEvent[] = [];
  let skipped = 0;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      skipped += 1;
      continue;
    }

    const parsed = runEventSchema.safeParse(raw);
    if (parsed.success) events.push(parsed.data);
    else skipped += 1;
  }

  return { events, skipped };
}

/* ------------------------------------------------------------- aggregation */

export function runAttempts(events: readonly RunEvent[]): RunAttemptEvent[] {
  return events.filter((event): event is RunAttemptEvent => event.kind === "run");
}

export function lastRunAttempt(events: readonly RunEvent[]): RunAttemptEvent | undefined {
  return runAttempts(events).at(-1);
}

/** Highest `attempt` recorded, 0 when the stone was never run. */
export function maxAttempt(events: readonly RunEvent[]): number {
  return runAttempts(events).reduce((max, event) => Math.max(max, event.attempt), 0);
}

/**
 * How many attempts the ledger accounts for. The count of lines and the
 * highest `attempt` should agree; they disagree when a line was lost, and the
 * larger of the two is the honest answer.
 */
export function attemptsFrom(events: readonly RunEvent[]): number {
  return Math.max(runAttempts(events).length, maxAttempt(events));
}

/** The number the next `run` line must carry. */
export function nextAttempt(events: readonly RunEvent[]): number {
  return attemptsFrom(events) + 1;
}

/**
 * Whether a proof about to be run differs from the one run last time.
 * `undefined` when there is nothing to compare against — a first attempt, or
 * a ledger written before hashes were recorded. Absence of evidence is not
 * `false`.
 */
export function proofEditedSince(
  events: readonly RunEvent[],
  proofHash: string | undefined,
): boolean | undefined {
  const previous = lastRunAttempt(events);
  if (!previous?.proofHash || proofHash === undefined) return undefined;
  return previous.proofHash !== proofHash;
}

/** Sum of the `tokens` fields, or null when no line ever carried one. */
export function tokensFrom(events: readonly RunEvent[]): number | null {
  let total = 0;
  let seen = false;
  for (const event of events) {
    if (event.kind === "amend") continue;
    if (event.tokens === undefined) continue;
    seen = true;
    total += event.tokens;
  }
  return seen ? total : null;
}

export function hasEscalated(events: readonly RunEvent[]): boolean {
  return events.some((event) => event.kind === "escalate");
}

export interface Share {
  numerator: number;
  denominator: number;
  /** numerator / denominator, or null when there is nothing to divide. */
  rate: number | null;
}

export function share(numerator: number, denominator: number): Share {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

/**
 * The share of attempts where the *proof* was wrong rather than the product.
 * Only attempts that can answer the question count: the first attempt of a
 * stone, and any attempt with no hash to compare, are left out of both terms.
 */
export function proofEditedShare(events: readonly RunEvent[]): Share {
  const known = runAttempts(events).filter((event) => event.proofEdited !== undefined);
  return share(known.filter((event) => event.proofEdited === true).length, known.length);
}

/** A red that turned green with nothing changing in between. */
export interface FlakyFlip {
  /** Attempt number of the red. */
  from: number;
  /** Attempt number of the green that followed it. */
  to: number;
  /**
   * How the "nothing changed" was established. `same-commit` is evidence;
   * `no-commit-info` is the weaker branch — see flakyFlips().
   */
  evidence: "same-commit" | "no-commit-info";
}

/**
 * Detect red → green flips with no code change between the two runs.
 *
 * The heuristic, stated honestly: two consecutive attempts on the same stone,
 * red then green, count as flaky when both name the **same commit** — the tree
 * was identical, so only the run differed. When commit information is missing
 * on either side we cannot know whether the product changed; the flip is still
 * counted, but only if the proof was not edited between the two runs, and the
 * flip is marked `no-commit-info` so the weaker evidence stays visible. A green
 * that follows a proof edit is never flaky: something *did* change.
 *
 * This is deliberately conservative in one direction only — it can over-count
 * on a ledger with no commits (a local run outside a git repo). Metrics report
 * the denominator alongside, so a suspicious rate can be read for what it is.
 */
export function flakyFlips(events: readonly RunEvent[]): FlakyFlip[] {
  const attempts = runAttempts(events);
  const flips: FlakyFlip[] = [];

  for (let index = 1; index < attempts.length; index += 1) {
    const before = attempts[index - 1] as RunAttemptEvent;
    const after = attempts[index] as RunAttemptEvent;
    if (before.result !== "red" || after.result !== "green") continue;
    if (after.proofEdited === true) continue;

    if (before.commit && after.commit) {
      if (before.commit === after.commit) {
        flips.push({ from: before.attempt, to: after.attempt, evidence: "same-commit" });
      }
      continue;
    }
    flips.push({ from: before.attempt, to: after.attempt, evidence: "no-commit-info" });
  }

  return flips;
}

export function isFlaky(events: readonly RunEvent[]): boolean {
  return flakyFlips(events).length > 0;
}

/** Median of a sample, null when empty. Even samples take the mean of the two middles. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] as number;
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** How many stones landed on each value, keyed by the value. */
export function distribution(values: readonly number[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of [...values].sort((a, b) => a - b)) {
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }
  return counts;
}

/* --------------------------------------------------------------- fs helpers */

/** Read one ledger. A missing file is an empty ledger, not an error. */
export async function readRunLedger(filePath: string): Promise<ParsedRunLedger> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return { events: [], skipped: 0 };
    throw cause;
  }
  return parseRunLedger(content);
}

/** Append one event, creating the runs directory the first time. */
export async function appendRunEvent(
  filePath: string,
  event: RunEvent | RunEventInput,
): Promise<RunEvent> {
  const parsed = runEventSchema.parse(event);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, serializeRunEvent(parsed), "utf8");
  return parsed;
}
