import path from "node:path";
import {
  applyVerifyResult,
  checkIntegrity,
  hashProof,
  normalizeUlid,
  resolveProofPath,
  shortHash,
  writeStone,
  type IntegrityReport,
  type Stone,
  type StoneFile,
  type StoneStatus,
  type VerifyResult,
} from "@cairn/core";
import pc from "picocolors";
import { CliError, EXIT, usageError } from "../errors.js";
import {
  paintStatus,
  printInfo,
  printJson,
  printOk,
  printWarn,
  shortId,
  statusMark,
} from "../format.js";
import { currentCommit } from "../git.js";
import type { Io } from "../io.js";
import {
  emptyReport,
  runProofs,
  statusForProof,
  type ParsedReport,
  type ProofRunOutcome,
} from "../playwright.js";
import { runCommandLine } from "../proc.js";
import { fileExists, loadProject, readAllStones, readFileOrNull, requireCairn, type Project } from "../project.js";

export interface VerifyOptions {
  dir?: string;
  /** Verify every non-retired stone. Implied when no ids are given. */
  all?: boolean;
  /** CI ratchet: only stones that are already proven may be verified. */
  provenOnly?: boolean;
  /** Also compare recorded proof hashes with the proofs on disk. */
  integrity?: boolean;
  /** Skip the runner entirely (pairs with --integrity for a pure audit). */
  noRun?: boolean;
  /** Replace the Playwright command, e.g. "node ./test/stub-runner.mjs". */
  runner?: string;
  /** Do not write the resulting statuses back to the stones. */
  dryRun?: boolean;
  json?: boolean;
  /** Stream the runner's own output. */
  verbose?: boolean;
}

/** What happened to one stone during a verify run. */
export interface VerifyRow {
  id: string;
  title: string;
  from: StoneStatus;
  to: StoneStatus;
  /** The proof outcome that was folded into the stone. */
  result: VerifyResult | "no-result";
  changed: boolean;
  reason?: string;
  proof: string | null;
  integrity?: IntegrityReport;
}

export async function verifyCommand(
  io: Io,
  ids: string[] = [],
  options: VerifyOptions = {},
): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const { stones, skipped } = await readAllStones(project);
  if (!options.json) for (const problem of skipped) printWarn(io, `unreadable stone ${problem}`);

  const selected = selectStones(stones, ids, options);
  if (selected.length === 0) {
    const message = ids.length > 0 ? "none of those stones can be verified" : "nothing to verify";
    if (options.json) printJson(io, { ok: true, ran: false, results: [], message });
    else printInfo(io, message);
    return EXIT.OK;
  }

  /* ------------------------------------------------------------ integrity */

  const integrityReports = new Map<string, IntegrityReport>();
  if (options.integrity) {
    for (const file of selected) {
      if (file.stone.status !== "proven") continue;
      const proofPath = file.stone.proof ? resolveProofPath(project.root, file.stone.proof) : null;
      const content = proofPath ? await readFileOrNull(proofPath) : null;
      integrityReports.set(file.stone.id, checkIntegrity(file.stone, content));
    }
  }

  /* ---------------------------------------------------------------- run */

  const runnable: StoneFile[] = [];
  const missing: StoneFile[] = [];
  for (const file of selected) {
    const proofPath = file.stone.proof ? resolveProofPath(project.root, file.stone.proof) : null;
    if (proofPath && (await fileExists(proofPath))) runnable.push(file);
    else missing.push(file);
  }

  let outcome: ProofRunOutcome | undefined;
  let report: ParsedReport = emptyReport();

  if (!options.noRun && runnable.length > 0) {
    await runSetupHook(io, project, options);

    if (!options.json) {
      printInfo(io, `running ${runnable.length} proof${runnable.length === 1 ? "" : "s"}…`);
    }

    outcome = await runProofs({
      root: project.root,
      specs: runnable.map((file) => file.stone.proof as string),
      runner: options.runner,
      retries: project.config.retries,
      baseURL: project.config.baseURL,
      onOutput: options.verbose && !options.json ? (chunk) => io.err(chunk.replace(/\n$/, "")) : undefined,
    });

    if (outcome.runnerMissing) {
      throw new CliError("No Playwright runner could be started", {
        details: [
          `Tried: ${outcome.command}`,
          "Install Playwright in the project, or point Cairn at a runner with",
          "  --runner \"<command>\"  or  CAIRN_PLAYWRIGHT_CMD=\"<command>\"",
        ],
      });
    }

    report = outcome.report;

    // A runner that blew up before running anything must not break every
    // stone: that is a broken toolchain, not a regression.
    if (report.specCount === 0 && (report.errors.length > 0 || outcome.run.code !== 0)) {
      throw new CliError("The proof runner failed before any proof ran", {
        details: [
          `Command: ${outcome.command}`,
          ...(report.errors.length > 0 ? report.errors : []),
          ...(outcome.run.stderr.trim() ? [outcome.run.stderr.trim().split("\n").slice(-5).join("\n")] : []),
        ],
      });
    }
  }

  /* -------------------------------------------------------------- apply */

  const at = new Date().toISOString();
  const commit = options.noRun || runnable.length === 0 ? undefined : await currentCommit(project.root);

  const rows: VerifyRow[] = [];
  const runnableIds = new Set(runnable.map((file) => file.stone.id));
  let noResult = 0;

  for (const file of selected) {
    const stone = file.stone;
    const integrity = integrityReports.get(stone.id);
    const wasRunnable = runnableIds.has(stone.id);

    if (!wasRunnable) {
      const applied = applyVerifyResult(stone, "missing", { at });
      rows.push(makeRow(stone, applied.stone.status, "missing", applied.changed, applied.reason, integrity));
      await persist(project, file, applied.stone, options);
      continue;
    }

    if (options.noRun) {
      rows.push(makeRow(stone, stone.status, "no-result", false, "run skipped (--no-run)", integrity));
      continue;
    }

    const specStatus = statusForProof(report, stone.proof as string);
    if (specStatus === undefined || specStatus === "skipped") {
      noResult += 1;
      rows.push(
        makeRow(
          stone,
          stone.status,
          "no-result",
          false,
          specStatus === "skipped" ? "the runner skipped this proof" : "the runner reported no result for this proof",
          integrity,
        ),
      );
      continue;
    }

    const result: VerifyResult = specStatus === "passed" ? "green" : "red";
    const proofPath = resolveProofPath(project.root, stone.proof as string);
    const content = result === "green" ? await readFileOrNull(proofPath) : null;

    const applied = applyVerifyResult(stone, result, {
      at,
      ...(commit ? { commit } : {}),
      ...(content !== null ? { proofHash: hashProof(content) } : {}),
    });

    rows.push(makeRow(stone, applied.stone.status, result, applied.changed, applied.reason, integrity));
    await persist(project, file, applied.stone, options);
  }

  /* ------------------------------------------------------------- report */

  const brokenNow = rows.filter((row) => row.to === "broken").length;
  const redNow = rows.filter((row) => row.result === "red").length;
  const integrityFailures = [...integrityReports.values()].filter((entry) => !entry.ok).length;
  // A red proof always fails the command, even when the stone itself does not
  // move (a red draft stays a draft, but the run is not a success).
  const exitCode =
    brokenNow > 0 || redNow > 0 || integrityFailures > 0 || noResult > 0 ? EXIT.FAILURE : EXIT.OK;

  if (options.json) {
    printJson(io, {
      ok: exitCode === EXIT.OK,
      ran: Boolean(outcome),
      command: outcome?.command ?? null,
      runnerExitCode: outcome?.run.code ?? null,
      at,
      commit: commit ?? null,
      dryRun: Boolean(options.dryRun),
      results: rows,
      integrity: options.integrity
        ? [...integrityReports.entries()].map(([id, entry]) => ({ id, ...entry }))
        : undefined,
      summary: {
        verified: rows.length,
        green: rows.filter((row) => row.result === "green").length,
        red: rows.filter((row) => row.result === "red").length,
        skipped: rows.filter((row) => row.result === "missing" || row.result === "no-result").length,
        broken: brokenNow,
        integrityFailures,
      },
      exitCode,
    });
    return exitCode;
  }

  for (const row of rows) {
    const move =
      row.from === row.to
        ? pc.dim(row.from)
        : `${pc.dim(row.from)} ${pc.dim("→")} ${paintStatus(row.to, row.to)}`;
    const mark = paintStatus(row.to, statusMark(row.to));
    const reason = row.reason ? pc.dim(`  ${row.reason}`) : "";
    io.out(`${mark} ${pc.dim(shortId(row.id))}  ${row.title}  ${move}${reason}`);
    if (row.integrity && !row.integrity.ok) {
      io.out(`  ${pc.red("integrity")} ${pc.dim(row.integrity.message)}`);
    }
  }

  io.out("");
  const green = rows.filter((row) => row.result === "green").length;
  const red = rows.filter((row) => row.result === "red").length;
  const summary = [
    `${green} green`,
    `${red} red`,
    `${rows.length - green - red} skipped`,
    ...(options.integrity ? [`${integrityFailures} integrity failure(s)`] : []),
  ].join(pc.dim(" · "));

  if (exitCode === EXIT.OK) printOk(io, summary);
  else io.err(`${pc.red("✗")} ${summary}`);

  if (options.dryRun) printInfo(io, "dry run: no stone was written");
  if (commit) printInfo(io, `commit ${shortHash(commit, 8)}`);

  return exitCode;
}

/* ------------------------------------------------------------- internals */

function makeRow(
  stone: Stone,
  to: StoneStatus,
  result: VerifyResult | "no-result",
  changed: boolean,
  reason: string | undefined,
  integrity: IntegrityReport | undefined,
): VerifyRow {
  return {
    id: stone.id,
    title: stone.title,
    from: stone.status,
    to,
    result,
    changed,
    ...(reason ? { reason } : {}),
    proof: stone.proof,
    ...(integrity ? { integrity } : {}),
  };
}

/** Write a stone back only when the verify run actually moved it. */
async function persist(
  project: Project,
  file: StoneFile,
  next: Stone,
  options: VerifyOptions,
): Promise<void> {
  if (options.dryRun) return;
  if (next === file.stone) return;
  if (JSON.stringify(next) === JSON.stringify(file.stone)) return;
  await writeStone(file.filePath, next, file.body);
}

export function selectStones(
  files: readonly StoneFile[],
  ids: readonly string[],
  options: VerifyOptions,
): StoneFile[] {
  const byId = new Map(files.map((file) => [file.stone.id, file]));

  let selected: StoneFile[];
  if (ids.length > 0) {
    selected = ids.map((raw) => {
      const id = normalizeUlid(raw);
      const file = byId.get(id);
      if (!file) throw usageError(`No stone with id ${id}`);
      return file;
    });
  } else {
    // No ids: `--all` is the explicit form, and also the sane default.
    selected = [...files];
  }

  return selected.filter(({ stone }) => {
    if (stone.status === "retired") return false;
    if (options.provenOnly && stone.status !== "proven") return false;
    return true;
  });
}

async function runSetupHook(io: Io, project: Project, options: VerifyOptions): Promise<void> {
  const setup = project.config.setup;
  if (!setup) return;

  if (!options.json) printInfo(io, `setup: ${setup}`);
  const result = await runCommandLine(setup, {
    cwd: project.root,
    env: { CAIRN_BASE_URL: project.config.baseURL },
    onStdout: options.verbose && !options.json ? (chunk) => io.err(chunk.replace(/\n$/, "")) : undefined,
    onStderr: options.verbose && !options.json ? (chunk) => io.err(chunk.replace(/\n$/, "")) : undefined,
  });

  if (result.error || result.code !== 0) {
    throw new CliError("The setup hook failed", {
      details: [
        `Command: ${setup}`,
        ...(result.error ? [String(result.error.message)] : [`Exit code: ${result.code}`]),
        ...(result.stderr.trim() ? [result.stderr.trim().split("\n").slice(-5).join("\n")] : []),
      ],
    });
  }
}

export const __testing = { makeRow };

/** Path helper kept next to verify for symmetry with the runner. */
export function proofRelativePath(project: Project, stone: Stone): string | null {
  return stone.proof ? path.relative(project.root, resolveProofPath(project.root, stone.proof)) : null;
}
