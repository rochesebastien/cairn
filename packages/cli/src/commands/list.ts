import path from "node:path";
import { STONE_STATUSES, type Stone, type StoneFile, type StoneStatus } from "@usecairn/core";
import pc from "picocolors";
import { EXIT, usageError } from "../errors.js";
import {
  abbreviateIds,
  paintStatus,
  printInfo,
  printJson,
  printWarn,
  relativeDate,
  renderTable,
  statusMark,
} from "../format.js";
import type { Io } from "../io.js";
import { loadProject, readAllStones, requireCairn } from "../project.js";

export interface ListOptions {
  dir?: string;
  status?: string;
  surface?: string;
  json?: boolean;
  /** Retired stones are hidden by default; this brings them back. */
  all?: boolean;
  /** Show full 26-char ULIDs instead of the short form. */
  long?: boolean;
}

export function parseStatusFilter(value: string | undefined): StoneStatus | undefined {
  if (!value) return undefined;
  const status = value.trim().toLowerCase();
  if (!(STONE_STATUSES as readonly string[]).includes(status)) {
    throw usageError(`Unknown status "${value}"`, [`Known statuses: ${STONE_STATUSES.join(", ")}`]);
  }
  return status as StoneStatus;
}

export interface StoneFilter {
  status?: StoneStatus;
  surface?: string;
  includeRetired?: boolean;
}

export function filterStones(files: readonly StoneFile[], filter: StoneFilter): StoneFile[] {
  return files.filter(({ stone }) => {
    if (filter.status && stone.status !== filter.status) return false;
    if (!filter.status && !filter.includeRetired && stone.status === "retired") return false;
    if (filter.surface && (stone.surface ?? "").toLowerCase() !== filter.surface.toLowerCase()) {
      return false;
    }
    return true;
  });
}

/** The JSON shape every read command emits for a stone. */
export function stoneJson(file: StoneFile, root: string): Stone & { path: string; body: string } {
  return {
    ...file.stone,
    body: file.body,
    path: path.relative(root, file.filePath).split(path.sep).join("/"),
  };
}

export async function listCommand(io: Io, options: ListOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const { stones, skipped } = await readAllStones(project);
  const selected = filterStones(stones, {
    status: parseStatusFilter(options.status),
    surface: options.surface,
    includeRetired: options.all,
  });

  if (options.json) {
    printJson(io, {
      ok: true,
      root: project.root,
      count: selected.length,
      stones: selected.map((file) => stoneJson(file, project.root)),
      ...(skipped.length > 0 ? { unreadable: skipped } : {}),
    });
    return EXIT.OK;
  }

  for (const problem of skipped) printWarn(io, `unreadable stone ${problem}`);

  if (selected.length === 0) {
    printInfo(io, stones.length === 0 ? "the cairn is empty" : "no stone matches that filter");
    return EXIT.OK;
  }

  // Abbreviate against the whole cairn, not the filtered view, so a printed id
  // still resolves when it is typed back into `cairn show`.
  const abbreviate = abbreviateIds(stones.map(({ stone }) => stone.id));

  const rows = selected.map(({ stone }) => [
    paintStatus(stone.status, `${statusMark(stone.status)} ${stone.status}`),
    options.long ? stone.id : abbreviate(stone.id),
    stone.title,
    stone.surface ?? pc.dim("—"),
    stone.acceptance.length > 0 ? String(stone.acceptance.length) : pc.dim("0"),
    stone.lastGreen ? pc.dim(relativeDate(stone.lastGreen.at)) : pc.dim("never"),
  ]);

  for (const line of renderTable(["status", "id", "title", "surface", "ac", "last green"], rows)) {
    io.out(line);
  }
  return EXIT.OK;
}
