import { createHash } from "node:crypto";
import { normalizeText } from "./stone-file.js";
import type { Stone } from "./schema.js";

/**
 * Proof integrity: a stone claims "this exact proof was green at this time".
 * The hash is taken over LF-normalised, BOM-stripped content so a checkout
 * with `core.autocrlf=true` on Windows does not invalidate every stone.
 */
export function hashProof(content: string): string {
  return createHash("sha256").update(normalizeText(content), "utf8").digest("hex");
}

/** Short, human-facing form of a proof hash. */
export function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}

export type IntegrityStatus =
  /** Hash matches the one recorded at the last green run. */
  | "match"
  /** The proof changed since the last green run: it must be re-verified. */
  | "mismatch"
  /** The stone has no lastGreen.proofHash to compare against. */
  | "unknown"
  /** The stone declares a proof but no content was found on disk. */
  | "missing";

export interface IntegrityReport {
  ok: boolean;
  status: IntegrityStatus;
  /** Hash recorded in lastGreen, when there is one. */
  expected?: string;
  /** Hash of the content on disk, when there is content. */
  actual?: string;
  message: string;
}

/**
 * Compare a stone's recorded proof hash with the proof currently on disk.
 * Pass `undefined`/`null` as `proofContent` when the file does not exist.
 *
 * `ok` is true for "match" and "unknown": an unknown baseline is not proof of
 * corruption, it just means the stone has never been green with a hash.
 */
export function checkIntegrity(
  stone: Stone,
  proofContent?: string | null,
): IntegrityReport {
  const expected = stone.lastGreen?.proofHash;

  if (proofContent === undefined || proofContent === null) {
    if (stone.proof) {
      return {
        ok: false,
        status: "missing",
        ...(expected ? { expected } : {}),
        message: `proof ${stone.proof} is declared by ${stone.id} but was not found`,
      };
    }
    return {
      ok: expected === undefined,
      status: expected === undefined ? "unknown" : "missing",
      ...(expected ? { expected } : {}),
      message: `stone ${stone.id} has no proof`,
    };
  }

  const actual = hashProof(proofContent);

  if (!expected) {
    return {
      ok: true,
      status: "unknown",
      actual,
      message: `stone ${stone.id} has never recorded a green proof hash`,
    };
  }

  if (expected === actual) {
    return {
      ok: true,
      status: "match",
      expected,
      actual,
      message: `proof of ${stone.id} is unchanged since ${stone.lastGreen?.at ?? "the last green run"}`,
    };
  }

  return {
    ok: false,
    status: "mismatch",
    expected,
    actual,
    message: `proof of ${stone.id} changed since the last green run (${shortHash(expected)} -> ${shortHash(actual)})`,
  };
}

/** Stamp the hash of `proofContent` onto a stone's lastGreen entry. */
export function withProofHash(stone: Stone, proofContent: string): Stone {
  if (!stone.lastGreen) return stone;
  return { ...stone, lastGreen: { ...stone.lastGreen, proofHash: hashProof(proofContent) } };
}
