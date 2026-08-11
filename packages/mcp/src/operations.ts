/**
 * The operations behind the MCP tools.
 *
 * Every one of them is a thin wrapper over @usecairn/core (the domain) and the
 * helpers @usecairn/cli already exports (project loading, stone reading, the
 * `add`/`amend` command implementations). There is **no new domain logic
 * here**: statuses move through core's `applyVerifyResult` / `transition`,
 * acceptance is judged by core's `lintAcceptance`, and stones are written by
 * core's `writeStone`. The MCP server is exposure, not a second implementation.
 */

import path from "node:path";
import {
  applyVerifyResult,
  formatViolations,
  hashProof,
  lintAcceptance,
  resolveProofPath,
  toPosixPath,
  transition,
  writeStone,
  type Stone,
  type StoneFile,
  type StoneStatus,
  type Violation,
  type VerifyResult,
} from "@usecairn/core";
import {
  addCommand,
  amendCommand,
  countByStatus,
  currentCommit,
  filterStones,
  loadProject,
  memoryIo,
  readAllStones,
  readFileOrNull,
  readOneStone,
  recordRun,
  requireCairn,
  stoneJson,
  type Io,
  type Project,
  type StatusCounts,
} from "@usecairn/cli";

/* --------------------------------------------------------------- plumbing */

export interface CairnTarget {
  /** Project root the server operates on (`--dir` / `CAIRN_DIR`). */
  dir: string;
}

/** A tool result: a JSON payload, plus whether it is a refusal. */
export interface OperationResult<T extends object = Record<string, unknown>> {
  payload: T;
  isError?: boolean;
}

/** The JSON shape every stone-returning tool emits, same as `cairn --json`. */
export type StoneJson = Stone & { body: string; path: string };

/** Load the target project and refuse early when it holds no cairn. */
async function open(target: CairnTarget): Promise<Project> {
  const project = await loadProject({ dir: target.dir });
  await requireCairn(project);
  return project;
}

/**
 * Run a CLI command in-process against a memory Io and take its `--json`
 * payload. Reusing the command means `create_draft` and `amend_stone` write
 * exactly what `cairn add` and `cairn amend` write — lineage, proof paths and
 * body inheritance included.
 */
async function callCommand<T>(fn: (io: Io) => Promise<number>): Promise<{ code: number; payload: T }> {
  const io = memoryIo({ stdin: "", isTTY: false });
  const code = await fn(io);
  const raw = io.stdout.join("\n").trim();
  if (!raw) {
    throw new Error(`the command produced no JSON payload${io.stderr.length ? `: ${io.stderr.join(" ")}` : ""}`);
  }
  return { code, payload: JSON.parse(raw) as T };
}

/** The single refusal shape both guarded tools return. */
export function acceptanceRefusal(violations: readonly Violation[]): OperationResult {
  return {
    isError: true,
    payload: {
      ok: false,
      error: "acceptance-criteria-are-user-language",
      message:
        "Refused: acceptance criteria must be user language. Rewrite them as what a user sees, " +
        "not as selectors, routes, identifiers, file paths or function calls.",
      violations: [...violations],
      formatted: formatViolations(violations),
    },
  };
}

function stoneWithBody(file: StoneFile, stone: Stone, project: Project): StoneJson {
  return {
    ...stone,
    body: file.body,
    path: toPosixPath(path.relative(project.root, file.filePath)),
  };
}

/* ------------------------------------------------------------ list_stones */

export interface ListStonesInput {
  status?: StoneStatus;
  surface?: string;
  includeRetired?: boolean;
}

export async function listStonesOp(
  target: CairnTarget,
  input: ListStonesInput = {},
): Promise<OperationResult> {
  const project = await open(target);
  const { stones, skipped } = await readAllStones(project);
  const selected = filterStones(stones, {
    ...(input.status ? { status: input.status } : {}),
    ...(input.surface ? { surface: input.surface } : {}),
    includeRetired: input.includeRetired ?? false,
  });

  return {
    payload: {
      ok: true,
      root: project.root,
      count: selected.length,
      stones: selected.map((file) => stoneJson(file, project.root)),
      ...(skipped.length > 0 ? { unreadable: skipped } : {}),
    },
  };
}

/* -------------------------------------------------------------- get_stone */

export async function getStoneOp(
  target: CairnTarget,
  input: { id: string },
): Promise<OperationResult> {
  const project = await open(target);
  const file = await readOneStone(project, input.id);
  return { payload: { ok: true, stone: stoneJson(file, project.root) } };
}

/* ----------------------------------------------------------- create_draft */

export interface DraftInput {
  title: string;
  request: string;
  intent?: string;
  acceptance?: string[];
  surface?: string;
  attempts?: number;
  tokens?: number;
  /** A path, or `true` for the conventional `<proofsDir>/<id>.spec.ts`. */
  proof?: string | boolean;
}

export async function createDraftOp(
  target: CairnTarget,
  input: DraftInput,
): Promise<OperationResult> {
  const acceptance = input.acceptance ?? [];

  // The guard-rail. It lives here, in the server, so no prompt can talk its
  // way past it — and there is deliberately no `force` over MCP.
  const violations = lintAcceptance(acceptance);
  if (violations.length > 0) return acceptanceRefusal(violations);

  const { code, payload } = await callCommand<Record<string, unknown>>((io) =>
    addCommand(io, {
      dir: target.dir,
      json: true,
      title: input.title,
      request: input.request,
      acceptance,
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      ...(input.surface !== undefined ? { surface: input.surface } : {}),
      ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
      ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
    }),
  );

  return { payload, ...(code === 0 ? {} : { isError: true }) };
}

/* ------------------------------------------------------------ amend_stone */

export interface AmendInput extends Partial<DraftInput> {
  id: string;
  /** Copy the retired stone's proof over to the new draft. */
  carryProof?: boolean;
}

export async function amendStoneOp(
  target: CairnTarget,
  input: AmendInput,
): Promise<OperationResult> {
  const project = await open(target);
  const old = await readOneStone(project, input.id);

  // `amend` inherits the acceptance criteria it is not given; the guard-rail
  // must judge the criteria the new stone will actually carry.
  const acceptance =
    input.acceptance && input.acceptance.length > 0 ? input.acceptance : old.stone.acceptance;
  const violations = lintAcceptance(acceptance);
  if (violations.length > 0) return acceptanceRefusal(violations);

  const { code, payload } = await callCommand<Record<string, unknown>>((io) =>
    amendCommand(io, old.stone.id, {
      dir: target.dir,
      json: true,
      acceptance,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.request !== undefined ? { request: input.request } : {}),
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      ...(input.surface !== undefined ? { surface: input.surface } : {}),
      ...(input.attempts !== undefined ? { attempts: input.attempts } : {}),
      ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
      ...(input.proof !== undefined ? { proof: input.proof } : {}),
      ...(input.carryProof !== undefined ? { carryProof: input.carryProof } : {}),
    }),
  );

  return { payload, ...(code === 0 ? {} : { isError: true }) };
}

/* ----------------------------------------------------------- retire_stone */

export async function retireStoneOp(
  target: CairnTarget,
  input: { id: string },
): Promise<OperationResult> {
  const project = await open(target);
  const file = await readOneStone(project, input.id);
  const from = file.stone.status;

  if (from === "retired") {
    return {
      isError: true,
      payload: {
        ok: false,
        error: "already-retired",
        message: `Stone ${file.stone.id} is already retired; retired is terminal.`,
        stone: stoneJson(file, project.root),
      },
    };
  }

  const next = transition(file.stone, "retired");
  await writeStone(file.filePath, next, file.body);

  return {
    payload: { ok: true, from, stone: stoneWithBody(file, next, project) },
  };
}

/* ------------------------------------------------------------- record_run */

export interface RunMeta {
  /** ISO instant of the run. Defaults to now. */
  at?: string;
  commit?: string;
  /** sha256 of the proof. Computed from disk when omitted. */
  proofHash?: string;
  /** Tokens this attempt cost, for the run ledger. Never guessed. */
  tokens?: number;
  /** Whether the proof was rewritten before this attempt. Inferred when omitted. */
  proofEdited?: boolean;
}

export interface RecordRunInput {
  stoneId: string;
  result: VerifyResult;
  runMeta?: RunMeta;
}

/**
 * Fold the outcome of a proof run into a stone, exactly the way `cairn verify`
 * does: core's `applyVerifyResult` decides the transition (a red draft stays a
 * draft), and a green run stamps `lastGreen` with the commit and the sha256 of
 * the proof that was green.
 *
 * A green or a red also appends one line to the stone's run ledger — the same
 * `.cairn/runs/<ulid>.jsonl` `cairn verify` writes, marked `source: "mcp"`.
 * `missing` is not a run and is not recorded.
 */
export async function recordRunOp(
  target: CairnTarget,
  input: RecordRunInput,
): Promise<OperationResult> {
  const project = await open(target);
  const file = await readOneStone(project, input.stoneId);
  const stone = file.stone;

  const at = input.runMeta?.at ?? new Date().toISOString();
  let proofHash = input.runMeta?.proofHash;
  let commit = input.runMeta?.commit;

  // green and red both mean the proof ran: the ledger wants the hash and the
  // commit of that run either way, not only of the green one.
  if (input.result === "green" || input.result === "red") {
    if (proofHash === undefined && stone.proof) {
      const content = await readFileOrNull(resolveProofPath(project.root, stone.proof));
      if (content !== null) proofHash = hashProof(content);
    }
    if (commit === undefined) commit = await currentCommit(project.root);
  }

  const applied = applyVerifyResult(stone, input.result, {
    at,
    ...(commit !== undefined ? { commit } : {}),
    ...(proofHash !== undefined ? { proofHash } : {}),
  });

  if (applied.changed) await writeStone(file.filePath, applied.stone, file.body);

  const recorded =
    input.result === "green" || input.result === "red"
      ? await recordRun(project, stone.id, {
          result: input.result,
          at,
          ...(commit !== undefined ? { commit } : {}),
          ...(proofHash !== undefined ? { proofHash } : {}),
          ...(input.runMeta?.proofEdited !== undefined
            ? { proofEdited: input.runMeta.proofEdited }
            : {}),
          ...(input.runMeta?.tokens !== undefined ? { tokens: input.runMeta.tokens } : {}),
          source: "mcp",
        })
      : {};

  return {
    payload: {
      ok: true,
      stoneId: stone.id,
      result: input.result,
      from: stone.status,
      to: applied.stone.status,
      changed: applied.changed,
      ...(applied.transition ? { transition: applied.transition } : {}),
      ...(applied.reason ? { reason: applied.reason } : {}),
      ...(recorded.event ? { attempt: recorded.event.attempt } : {}),
      // A ledger write that failed is said out loud; it never fails the fold.
      ...(recorded.warning ? { ledgerWarning: recorded.warning } : {}),
      stone: stoneWithBody(file, applied.stone, project),
    },
  };
}

/* -------------------------------------------------------- get_escalations */

export async function getEscalationsOp(target: CairnTarget): Promise<OperationResult> {
  const project = await open(target);
  const { stones, skipped } = await readAllStones(project);
  const escalated = stones.filter(({ stone }) => stone.status === "escalated");

  return {
    payload: {
      ok: true,
      root: project.root,
      count: escalated.length,
      stones: escalated.map((file) => stoneJson(file, project.root)),
      ...(skipped.length > 0 ? { unreadable: skipped } : {}),
    },
  };
}

/* --------------------------------------------------------- lint_acceptance */

/**
 * Judge acceptance criteria without writing anything. This is the same lint
 * `create_draft` and `amend_stone` enforce, offered up front so an agent can
 * fix its wording before it tries to raise a stone.
 */
export function lintAcceptanceOp(input: { criteria: string[] }): OperationResult {
  const violations = lintAcceptance(input.criteria);
  return {
    payload: {
      ok: true,
      clean: violations.length === 0,
      count: violations.length,
      violations,
      formatted: formatViolations(violations),
    },
  };
}

/* ------------------------------------------------------------- resources */

/** `cairn://stones` — the whole cairn, retired stones included. */
export async function cairnPayload(target: CairnTarget): Promise<Record<string, unknown>> {
  const project = await open(target);
  const { stones, skipped } = await readAllStones(project);
  return {
    root: project.root,
    config: project.configPath,
    count: stones.length,
    stones: stones.map((file) => stoneJson(file, project.root)),
    ...(skipped.length > 0 ? { unreadable: skipped } : {}),
  };
}

/** `cairn://stone/{id}` — one stone, by full id or unique prefix. */
export async function stonePayload(
  target: CairnTarget,
  id: string,
): Promise<Record<string, unknown>> {
  const project = await open(target);
  const file = await readOneStone(project, id);
  return { stone: stoneJson(file, project.root) };
}

/** `cairn://status` — the synthesis `cairn status --json` prints. */
export async function statusPayload(target: CairnTarget): Promise<Record<string, unknown>> {
  const project = await open(target);
  const { stones, skipped } = await readAllStones(project);
  const counts: StatusCounts = countByStatus(stones);
  const active = stones.filter(({ stone }) => stone.status !== "retired");
  const coverage = active.length === 0 ? 0 : Math.round((counts.proven / active.length) * 100);
  const brief = (file: StoneFile) => ({
    id: file.stone.id,
    title: file.stone.title,
    surface: file.stone.surface ?? null,
    proof: file.stone.proof,
    lastGreen: file.stone.lastGreen,
  });

  return {
    ok: true,
    root: project.root,
    config: project.configPath,
    total: stones.length,
    active: active.length,
    counts,
    coverage,
    drafts: stones.filter(({ stone }) => stone.status === "draft").map(brief),
    broken: stones.filter(({ stone }) => stone.status === "broken").map(brief),
    escalated: stones.filter(({ stone }) => stone.status === "escalated").map(brief),
    ...(skipped.length > 0 ? { unreadable: skipped } : {}),
  };
}
