import {
  attemptsFrom,
  escalate,
  IllegalTransitionError,
  legalTransitions,
  normalizeUlid,
  tokensFrom,
  writeStone,
} from "@cairn/core";
import pc from "picocolors";
import { CliError, EXIT } from "../errors.js";
import { printInfo, printJson, printOk, printWarn, shortId } from "../format.js";
import type { Io } from "../io.js";
import { appendToLedger, readLedger } from "../ledger.js";
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

  // The ledger counted the attempts; the flags only override it. What lands
  // in provenance is the durable summary — the ledger stays out of git.
  const ledger = await readLedger(project, file.stone.id);
  const counted = attemptsFrom(ledger.events);
  const summed = tokensFrom(ledger.events);
  const attempts = options.attempts ?? (counted > 0 ? counted : undefined);
  const tokens = options.tokens ?? (summed !== null ? summed : undefined);

  let next;
  try {
    next = escalate(file.stone, {
      ...(attempts !== undefined ? { attempts } : {}),
      ...(tokens !== undefined ? { tokens } : {}),
    });
  } catch (cause) {
    if (cause instanceof IllegalTransitionError) {
      throw new CliError(
        `Cannot escalate a stone whose status is ${file.stone.status}`,
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

  const at = new Date().toISOString();
  const appended = await appendToLedger(project, file.stone.id, {
    kind: "escalate",
    at,
    ...(attempts !== undefined ? { attempts } : {}),
    ...(tokens !== undefined ? { tokens } : {}),
  });
  const warnings = [ledger.warning, appended.warning].filter((warning): warning is string =>
    Boolean(warning),
  );

  if (options.json) {
    printJson(io, {
      ok: true,
      stone: next,
      from: file.stone.status,
      attempts: attempts ?? null,
      tokens: tokens ?? null,
      attemptsFromLedger: options.attempts === undefined && counted > 0,
      ...(warnings.length > 0 ? { ledgerWarnings: warnings } : {}),
    });
    return EXIT.OK;
  }

  for (const warning of warnings) printWarn(io, warning);

  printOk(io, `escalated ${pc.bold(next.title)}`);
  printInfo(io, `${file.stone.status} → escalated`);
  if (attempts !== undefined) {
    const source = options.attempts === undefined ? " (from the run ledger)" : "";
    printInfo(io, `attempts ${attempts}${pc.dim(source)}`);
  }
  printInfo(io, "a human decides now: amend the stone, or fix the product.");
  return EXIT.OK;
}
