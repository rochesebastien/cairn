import path from "node:path";
import {
  appendRunEvent,
  nextAttempt,
  proofEditedSince,
  readRunLedger,
  runAttemptEventSchema,
  runLedgerName,
  type RunAttemptEvent,
  type RunEvent,
  type RunEventInput,
  type RunResult,
  type RunSource,
} from "@usecairn/core";
import type { Project } from "./project.js";

/**
 * The CLI side of the measurement ledger (`.cairn/runs/<ulid>.jsonl`).
 *
 * The format, the numbering and the aggregations live in @usecairn/core; this is
 * the project-level glue plus one policy: **a ledger failure never fails the
 * command that produced it**. The ledger is evidence, the cairn is the
 * registry. Losing a line is worth a warning, not a red build — so every
 * function here returns its problem as a string instead of throwing.
 */

export function ledgerPath(project: Project, id: string): string {
  return path.join(project.runsDir, runLedgerName(id));
}

export interface LedgerRead {
  events: RunEvent[];
  /** Lines that could not be parsed. */
  skipped: number;
  /** Set when the file itself could not be read. */
  warning?: string;
}

/** Read one stone's ledger. A missing ledger is an empty one. */
export async function readLedger(project: Project, id: string): Promise<LedgerRead> {
  try {
    return await readRunLedger(ledgerPath(project, id));
  } catch (error) {
    return { events: [], skipped: 0, warning: describe(id, error) };
  }
}

export interface AppendedEvent {
  /** The event as it was written, absent when the write failed. */
  event?: RunEvent;
  warning?: string;
}

/** Append one event. Reports the failure instead of raising it. */
export async function appendToLedger(
  project: Project,
  id: string,
  event: RunEventInput,
): Promise<AppendedEvent> {
  try {
    return { event: await appendRunEvent(ledgerPath(project, id), event) };
  } catch (error) {
    return { warning: describe(id, error) };
  }
}

export interface RunLine {
  result: RunResult;
  at: string;
  commit?: string;
  /** sha256 of the proof as it was run. */
  proofHash?: string;
  /** Overrides the hash comparison, when the caller knows better. */
  proofEdited?: boolean;
  tokens?: number;
  source?: RunSource;
}

export interface RecordedRun {
  /** The `run` line as it was written, absent when the write failed. */
  event?: RunAttemptEvent;
  warning?: string;
}

/**
 * Append one `run` line, numbering the attempt and deciding `proofEdited`
 * from what the ledger already holds.
 */
export async function recordRun(
  project: Project,
  id: string,
  line: RunLine,
): Promise<RecordedRun> {
  const { events, warning } = await readLedger(project, id);
  if (warning) return { warning };

  const proofEdited = line.proofEdited ?? proofEditedSince(events, line.proofHash);

  try {
    const event = runAttemptEventSchema.parse({
      kind: "run",
      at: line.at,
      result: line.result,
      attempt: nextAttempt(events),
      ...(line.commit !== undefined ? { commit: line.commit } : {}),
      ...(line.proofHash !== undefined ? { proofHash: line.proofHash } : {}),
      ...(proofEdited !== undefined ? { proofEdited } : {}),
      ...(line.tokens !== undefined ? { tokens: line.tokens } : {}),
      ...(line.source !== undefined ? { source: line.source } : {}),
    });
    await appendRunEvent(ledgerPath(project, id), event);
    return { event };
  } catch (error) {
    return { warning: describe(id, error) };
  }
}

function describe(id: string, error: unknown): string {
  return `run ledger of ${id}: ${(error as Error)?.message ?? String(error)}`;
}
