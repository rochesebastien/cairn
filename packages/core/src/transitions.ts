import { newUlid } from "./ulid.js";
import {
  stoneSchema,
  type LastGreen,
  type Provenance,
  type Stone,
  type StoneStatus,
} from "./schema.js";

/**
 * The frozen stone state machine.
 *
 *   draft ──proof green──▶ proven ──proof red──▶ broken ──green again──▶ proven
 *   draft / broken ──budget exhausted──▶ escalated
 *   any active status ──amend──▶ retired   (terminal)
 */
export const TRANSITIONS: Readonly<Record<StoneStatus, readonly StoneStatus[]>> = Object.freeze({
  draft: ["proven", "escalated", "retired"],
  proven: ["broken", "retired"],
  broken: ["proven", "escalated", "retired"],
  escalated: ["retired"],
  retired: [],
});

export class IllegalTransitionError extends Error {
  readonly from: StoneStatus;
  readonly to: StoneStatus;
  readonly stoneId?: string;

  constructor(from: StoneStatus, to: StoneStatus, stoneId?: string) {
    super(
      `Illegal stone transition ${from} -> ${to}${stoneId ? ` for ${stoneId}` : ""}` +
        (from === "retired" ? " (retired is terminal)" : ""),
    );
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
    this.stoneId = stoneId;
  }
}

/**
 * True when `from -> to` is a legal move. Identity is not a transition and
 * returns false; idempotent refreshes are handled by applyVerifyResult().
 */
export function canTransition(from: StoneStatus, to: StoneStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: StoneStatus): boolean {
  return status === "retired";
}

export function isActive(status: StoneStatus): boolean {
  return status !== "retired";
}

export function legalTransitions(from: StoneStatus): StoneStatus[] {
  return [...(TRANSITIONS[from] ?? [])];
}

/** Move a stone to `to`, returning a new stone. Throws when illegal. */
export function transition(stone: Stone, to: StoneStatus, patch: Partial<Stone> = {}): Stone {
  if (!canTransition(stone.status, to)) {
    throw new IllegalTransitionError(stone.status, to, stone.id);
  }
  return { ...stone, ...patch, status: to };
}

/* ------------------------------------------------------------------ verify */

/** Outcome of running a stone's proof. */
export type VerifyResult = "green" | "red" | "missing";

export interface VerifyMeta {
  /** ISO instant recorded in lastGreen. Defaults to now. */
  at?: string;
  commit?: string;
  proofHash?: string;
}

export interface ApplyVerifyOutcome {
  stone: Stone;
  /** Whether anything at all changed (status and/or lastGreen). */
  changed: boolean;
  /** Set only when the status actually moved. */
  transition?: { from: StoneStatus; to: StoneStatus };
  /** Why nothing happened, for CLI reporting. */
  reason?: string;
}

/**
 * Fold a proof run result into a stone.
 *
 * - green   : draft/broken → proven, and lastGreen is (re)stamped. A stone
 *             already proven stays proven with a refreshed lastGreen.
 * - red     : proven → broken. A draft only breaks once it has a proof;
 *             a draft without a proof is untouched.
 * - missing : a draft without a proof is a no-op (nothing has been proven
 *             yet). A proven stone whose proof vanished becomes broken.
 *
 * `escalated` and `retired` stones are never moved by a verify run: they need
 * a human decision (escalated) or are terminal (retired).
 */
export function applyVerifyResult(
  stone: Stone,
  result: VerifyResult,
  meta: VerifyMeta = {},
): ApplyVerifyOutcome {
  const { status } = stone;

  if (status === "retired") {
    return { stone, changed: false, reason: "stone is retired" };
  }
  if (status === "escalated") {
    return { stone, changed: false, reason: "stone is escalated and awaits a human" };
  }

  if (result === "green") {
    const lastGreen = buildLastGreen(meta);
    if (status === "proven") {
      return { stone: { ...stone, lastGreen }, changed: true };
    }
    return {
      stone: { ...transition(stone, "proven"), lastGreen },
      changed: true,
      transition: { from: status, to: "proven" },
    };
  }

  if (result === "red") {
    if (status === "proven") {
      return {
        stone: transition(stone, "broken"),
        changed: true,
        transition: { from: "proven", to: "broken" },
      };
    }
    if (status === "broken") {
      return { stone, changed: false, reason: "already broken" };
    }
    // draft: `broken` means "regressed", and a draft has never been green, so
    // a red proof simply means the stone is not proven yet. The way out of a
    // draft that will not go green is escalate(), not broken.
    return {
      stone,
      changed: false,
      reason: stone.proof ? "draft is not proven yet" : "draft has no proof yet",
    };
  }

  // result === "missing"
  if (status === "proven") {
    return {
      stone: transition(stone, "broken"),
      changed: true,
      transition: { from: "proven", to: "broken" },
      reason: "proof file is missing",
    };
  }
  return { stone, changed: false, reason: "no proof to run" };
}

function buildLastGreen(meta: VerifyMeta): LastGreen {
  const lastGreen: LastGreen = { at: meta.at ?? new Date().toISOString() };
  if (meta.commit !== undefined) lastGreen.commit = meta.commit;
  if (meta.proofHash !== undefined) lastGreen.proofHash = meta.proofHash;
  return lastGreen;
}

/* ---------------------------------------------------------------- escalate */

/** draft/broken → escalated, when the attempt budget is exhausted. */
export function escalate(stone: Stone, provenance?: Partial<Provenance>): Stone {
  const next = transition(stone, "escalated");
  return provenance ? { ...next, provenance: { ...next.provenance, ...provenance } } : next;
}

/* ------------------------------------------------------------------ amend */

export interface AmendPatch {
  title?: string;
  surface?: string;
  acceptance?: string[];
  provenance?: Provenance;
  /** Body of the new stone is handled by the caller; ids are injectable for tests. */
  id?: string;
  createdAt?: string;
  /** Proof path for the new draft. Defaults to null: the proof is rewritten. */
  proof?: string | null;
}

export interface Amendment {
  /** The new draft stone, pointing back at the old one through `amends`. */
  newStone: Stone;
  /** The old stone, retired and pointing forward through `amendedBy`. */
  retiredOld: Stone;
}

/**
 * Stones are never edited, they are amended: this creates a fresh draft that
 * `amends` the old stone, and retires the old one with `amendedBy` set. The
 * old proof therefore leaves the active suite.
 */
export function createAmendment(oldStone: Stone, patch: AmendPatch = {}): Amendment {
  if (oldStone.status === "retired") {
    throw new IllegalTransitionError("retired", "retired", oldStone.id);
  }

  const id = patch.id ?? newUlid();
  const createdAt = patch.createdAt ?? new Date().toISOString();

  const newStone = stoneSchema.parse({
    id,
    title: patch.title ?? oldStone.title,
    status: "draft",
    createdAt,
    ...(patch.surface ?? oldStone.surface ? { surface: patch.surface ?? oldStone.surface } : {}),
    amends: oldStone.id,
    amendedBy: null,
    acceptance: patch.acceptance ?? oldStone.acceptance,
    provenance: patch.provenance ?? oldStone.provenance,
    lastGreen: null,
    proof: patch.proof ?? null,
  });

  const retiredOld: Stone = { ...transition(oldStone, "retired"), amendedBy: newStone.id };

  return { newStone, retiredOld };
}

/**
 * Walk an amendment chain from its root to its newest stone.
 * `stones` may be given in any order; unknown links stop the walk.
 */
export function amendChain(stones: readonly Stone[], id: string): Stone[] {
  const byId = new Map(stones.map((stone) => [stone.id, stone]));
  const start = byId.get(id);
  if (!start) return [];

  const chain: Stone[] = [start];

  let cursor: Stone | undefined = start;
  const seenBack = new Set<string>([start.id]);
  while (cursor?.amends) {
    const previous: Stone | undefined = byId.get(cursor.amends);
    if (!previous || seenBack.has(previous.id)) break;
    seenBack.add(previous.id);
    chain.unshift(previous);
    cursor = previous;
  }

  cursor = start;
  const seenForward = new Set<string>([start.id]);
  while (cursor?.amendedBy) {
    const next: Stone | undefined = byId.get(cursor.amendedBy);
    if (!next || seenForward.has(next.id)) break;
    seenForward.add(next.id);
    chain.push(next);
    cursor = next;
  }

  return chain;
}

/** The stone that is still active in an amendment chain, if any. */
export function currentStone(stones: readonly Stone[], id: string): Stone | undefined {
  const chain = amendChain(stones, id);
  return [...chain].reverse().find((stone) => stone.status !== "retired");
}
