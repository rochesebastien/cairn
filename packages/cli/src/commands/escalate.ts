import {
  escalate,
  IllegalTransitionError,
  legalTransitions,
  normalizeUlid,
  writeStone,
} from "@cairn/core";
import pc from "picocolors";
import { CliError, EXIT } from "../errors.js";
import { printInfo, printJson, printOk, shortId } from "../format.js";
import type { Io } from "../io.js";
import { loadProject, readOneStone, requireCairn } from "../project.js";

export interface EscalateOptions {
  dir?: string;
  json?: boolean;
  /** Attempts spent before giving up, recorded in provenance. */
  attempts?: number;
  tokens?: number;
}

/**
 * Hand a stone back to a human: draft/broken → escalated when the attempt
 * budget is exhausted. `escalated` is the only status a verify run will not
 * move — its only exit is an amend.
 */
export async function escalateCommand(
  io: Io,
  id: string,
  options: EscalateOptions = {},
): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const file = await readOneStone(project, normalizeUlid(id));

  let next;
  try {
    next = escalate(file.stone, {
      ...(options.attempts !== undefined ? { attempts: options.attempts } : {}),
      ...(options.tokens !== undefined ? { tokens: options.tokens } : {}),
    });
  } catch (cause) {
    if (cause instanceof IllegalTransitionError) {
      throw new CliError(
        `Cannot escalate a ${file.stone.status} stone`,
        {
          details: [
            `${shortId(file.stone.id)} can only move to: ${legalTransitions(file.stone.status).join(", ") || "nothing, it is terminal"}`,
            "Only a draft or a broken stone can be escalated.",
          ],
          cause,
        },
      );
    }
    throw cause;
  }

  await writeStone(file.filePath, next, file.body);

  if (options.json) {
    printJson(io, { ok: true, stone: next, from: file.stone.status });
    return EXIT.OK;
  }

  printOk(io, `escalated ${pc.bold(next.title)}`);
  printInfo(io, `${file.stone.status} → escalated`);
  printInfo(io, "a human decides now: amend the stone, or fix the product.");
  return EXIT.OK;
}
