import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  createAmendment,
  defaultProofPath,
  formatViolations,
  IllegalTransitionError,
  newUlid,
  normalizeUlid,
  resolveProofPath,
  toPosixPath,
  writeStoneToDir,
} from "@cairn/core";
import pc from "picocolors";
import { CliError, EXIT, usageError } from "../errors.js";
import { printInfo, printJson, printOk, printViolations, printWarn, shortId } from "../format.js";
import type { Io } from "../io.js";
import { fileExists, loadProject, readOneStone, requireCairn } from "../project.js";
import { lintContent, resolveContent, type ContentFlags } from "../stone-input.js";
import { resolveProofField } from "./add.js";

export interface AmendOptions extends ContentFlags {
  dir?: string;
  id?: string;
  /** Copy the retired stone's proof over to the new draft's proof path. */
  carryProof?: boolean;
}

/**
 * Stones are never edited. `amend` raises a new draft that supersedes the old
 * stone, retires the old one, and records the lineage in both directions —
 * so the old proof leaves the active suite in the same movement.
 */
export async function amendCommand(io: Io, id: string, options: AmendOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const oldId = normalizeUlid(id);
  const oldFile = await readOneStone(project, oldId);
  const oldStone = oldFile.stone;

  if (oldStone.status === "retired") {
    throw new CliError(`Stone ${shortId(oldStone.id)} is already retired`, {
      details: [
        oldStone.amendedBy
          ? `It was amended by ${oldStone.amendedBy}. Amend that one instead.`
          : "retired is terminal.",
      ],
    });
  }

  const content = await resolveContent(io, options);
  // Anything not supplied is inherited from the stone being amended.
  const acceptance = content.acceptance.length > 0 ? content.acceptance : oldStone.acceptance;
  const { violations, allowed } = lintContent({ ...content, acceptance }, options.force);

  if (!allowed) {
    if (options.json) {
      printJson(io, { ok: false, error: "acceptance-criteria-are-user-language", violations });
    } else {
      io.err(`${pc.red("✗")} refused: acceptance criteria must be user language`);
      printViolations(io, violations);
      io.err(`  ${pc.dim("rewrite them as what a user sees, or pass --force to insist")}`);
    }
    return EXIT.REFUSED;
  }

  const newId = options.id ?? newUlid();
  const proof =
    resolveProofField(content.proof, newId, project) ??
    (options.carryProof ? defaultProofPath(newId, project.config.proofsDir) : null);

  let amendment;
  try {
    amendment = createAmendment(oldStone, {
      id: newId,
      ...(content.title ? { title: content.title.trim() } : {}),
      ...(content.surface ? { surface: content.surface } : {}),
      acceptance,
      ...(content.provenance ? { provenance: content.provenance } : {}),
      proof,
    });
  } catch (cause) {
    if (cause instanceof IllegalTransitionError) {
      throw new CliError(cause.message, { cause });
    }
    throw cause;
  }

  const body = content.intent || oldFile.body;

  // The new draft is written first: if anything fails, the old stone is still
  // the live one and the cairn stays consistent.
  const newPath = await writeStoneToDir(project.stonesDir, amendment.newStone, body);
  await writeStoneToDir(project.stonesDir, amendment.retiredOld, oldFile.body);

  let carried: string | null = null;
  if (options.carryProof) {
    carried = await carryProofFile(project.root, oldStone.proof, amendment.newStone.proof);
  }

  if (options.json) {
    printJson(io, {
      ok: true,
      stone: { ...amendment.newStone, body },
      retired: amendment.retiredOld,
      path: toPosixPath(path.relative(project.root, newPath)),
      ...(carried ? { carriedProof: carried } : {}),
      ...(violations.length > 0 ? { forcedViolations: violations } : {}),
    });
    return EXIT.OK;
  }

  if (violations.length > 0) {
    printWarn(io, `${violations.length} lint violation(s) forced into the cairn:`);
    for (const violationLine of formatViolations(violations)) io.err(`  ${pc.dim(violationLine)}`);
  }

  printOk(io, `amended ${pc.bold(oldStone.title)}`);
  printInfo(io, `retired ${oldStone.id} ${pc.dim(`(${oldStone.status} → retired)`)}`);
  printInfo(io, `new     ${amendment.newStone.id} ${pc.dim("(draft)")}`);
  printInfo(io, `title   ${amendment.newStone.title}`);
  printInfo(
    io,
    `proof   ${amendment.newStone.proof ?? pc.dim("none yet — the old proof left the suite")}`,
  );
  if (carried) printInfo(io, `carried ${carried}`);

  return EXIT.OK;
}

/** Copy the old proof next to the new stone so it can be reworked in place. */
async function carryProofFile(
  root: string,
  oldProof: string | null,
  newProof: string | null,
): Promise<string | null> {
  if (!oldProof) {
    throw usageError("--carry-proof was passed but the amended stone has no proof");
  }
  if (!newProof) return null;

  const from = resolveProofPath(root, oldProof);
  const to = resolveProofPath(root, newProof);
  if (!(await fileExists(from))) {
    throw usageError(`--carry-proof: ${oldProof} does not exist`);
  }
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  return newProof;
}
