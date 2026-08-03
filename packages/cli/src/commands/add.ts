import path from "node:path";
import {
  defaultProofPath,
  formatViolations,
  newUlid,
  parseStone,
  toPosixPath,
  writeStoneToDir,
  type Stone,
} from "@cairn/core";
import pc from "picocolors";
import { EXIT, usageError } from "../errors.js";
import { printInfo, printJson, printOk, printViolations, printWarn, shortId } from "../format.js";
import type { Io } from "../io.js";
import { loadProject, requireCairn, type Project } from "../project.js";
import { lintContent, resolveContent, type ContentFlags, type StoneContent } from "../stone-input.js";

export interface AddOptions extends ContentFlags {
  dir?: string;
  /** Inject a fixed id (tests, and agents that pre-allocate ids). */
  id?: string;
}

/**
 * Turn resolved content into a draft stone. Shared with `amend`, which builds
 * its stone through createAmendment() but validates the same way.
 */
export function contentToStone(
  content: StoneContent,
  project: Project,
  options: { id?: string; createdAt?: string } = {},
): Stone {
  if (!content.title || content.title.trim().length === 0) {
    throw usageError("A stone needs a title", [
      'Pass --title "…", or a JSON payload on stdin with --json.',
    ]);
  }
  if (!content.provenance?.request) {
    throw usageError("A stone needs its provenance: the verbatim user request", [
      'Pass --request "…" with the user\'s own words. Never paraphrase it.',
    ]);
  }

  const id = options.id ?? newUlid();

  return parseStone({
    id,
    title: content.title.trim(),
    status: "draft",
    createdAt: options.createdAt ?? new Date().toISOString(),
    ...(content.surface ? { surface: content.surface } : {}),
    amends: null,
    amendedBy: null,
    acceptance: content.acceptance,
    provenance: content.provenance,
    lastGreen: null,
    proof: resolveProofField(content.proof, id, project),
  });
}

/** `--proof` with no value picks the conventional path for the stone. */
export function resolveProofField(
  proof: string | boolean | undefined,
  id: string,
  project: Project,
): string | null {
  if (proof === undefined || proof === false) return null;
  if (proof === true) {
    return defaultProofPath(id, project.config.proofsDir);
  }
  return toPosixPath(path.isAbsolute(proof) ? path.relative(project.root, proof) : proof);
}

/** Create a draft stone. Refuses criteria that leak implementation detail. */
export async function addCommand(io: Io, options: AddOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const content = await resolveContent(io, options);
  const { violations, allowed } = lintContent(content, options.force);

  if (!allowed) {
    if (options.json) {
      printJson(io, {
        ok: false,
        error: "acceptance-criteria-are-user-language",
        violations,
      });
    } else {
      io.err(`${pc.red("✗")} refused: acceptance criteria must be user language`);
      printViolations(io, violations);
      io.err(`  ${pc.dim("rewrite them as what a user sees, or pass --force to insist")}`);
    }
    return EXIT.REFUSED;
  }

  const stone = contentToStone(content, project, { id: options.id });
  const filePath = await writeStoneToDir(project.stonesDir, stone, content.intent);

  if (options.json) {
    printJson(io, {
      ok: true,
      stone,
      body: content.intent,
      path: toPosixPath(path.relative(project.root, filePath)),
      ...(violations.length > 0 ? { forcedViolations: violations } : {}),
    });
    return EXIT.OK;
  }

  if (violations.length > 0) {
    printWarn(io, `${violations.length} lint violation(s) forced into the cairn:`);
    for (const line of formatViolations(violations)) io.err(`  ${pc.dim(line)}`);
  }

  printOk(io, `raised ${pc.bold(stone.title)}`);
  printInfo(io, `id      ${stone.id} ${pc.dim(`(${shortId(stone.id)})`)}`);
  printInfo(io, `file    ${path.relative(project.root, filePath)}`);
  if (stone.surface) printInfo(io, `surface ${stone.surface}`);
  printInfo(io, `proof   ${stone.proof ?? pc.dim("none yet — write it, then `cairn verify`")}`);
  for (const [index, criterion] of stone.acceptance.entries()) {
    io.out(`  ${pc.dim(`${index + 1}.`)} ${criterion}`);
  }

  return EXIT.OK;
}
