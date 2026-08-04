import { STONE_STATUSES, type StoneFile, type StoneStatus } from "@cairn/core";
import pc from "picocolors";
import { EXIT } from "../errors.js";
import {
  abbreviateIds,
  paintStatus,
  printInfo,
  printJson,
  printWarn,
  relativeDate,
  renderCounts,
  statusMark,
} from "../format.js";
import type { Io } from "../io.js";
import { loadProject, readAllStones, requireCairn } from "../project.js";

export interface StatusOptions {
  dir?: string;
  json?: boolean;
}

export type StatusCounts = Record<StoneStatus, number>;

export function countByStatus(files: readonly StoneFile[]): StatusCounts {
  const counts = Object.fromEntries(STONE_STATUSES.map((status) => [status, 0])) as StatusCounts;
  for (const { stone } of files) counts[stone.status] += 1;
  return counts;
}

/** The synthesis an agent (or a human) reads before deciding what to do next. */
export async function statusCommand(io: Io, options: StatusOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const { stones, skipped } = await readAllStones(project);
  const counts = countByStatus(stones);
  const abbreviate = abbreviateIds(stones.map(({ stone }) => stone.id));

  const drafts = stones.filter(({ stone }) => stone.status === "draft");
  const broken = stones.filter(({ stone }) => stone.status === "broken");
  const escalated = stones.filter(({ stone }) => stone.status === "escalated");
  const active = stones.filter(({ stone }) => stone.status !== "retired");
  const proven = counts.proven;
  const coverage = active.length === 0 ? 0 : Math.round((proven / active.length) * 100);

  if (options.json) {
    printJson(io, {
      ok: true,
      root: project.root,
      config: project.configPath ? project.configPath : null,
      total: stones.length,
      active: active.length,
      counts,
      coverage,
      drafts: drafts.map(brief),
      broken: broken.map(brief),
      escalated: escalated.map(brief),
      ...(skipped.length > 0 ? { unreadable: skipped } : {}),
    });
    return EXIT.OK;
  }

  for (const problem of skipped) printWarn(io, `unreadable stone ${problem}`);

  io.out(
    `${pc.bold("cairn")} ${pc.dim(project.root)}  ${pc.dim(`${stones.length} stone${stones.length === 1 ? "" : "s"}`)}`,
  );
  io.out(`  ${renderCounts(counts)}`);
  if (active.length > 0) {
    io.out(
      `  ${pc.dim("proven")} ${pc.bold(`${coverage}%`)} ${pc.dim(`of ${active.length} active stone${active.length === 1 ? "" : "s"}`)}`,
    );
  }

  section("awaiting a proof", drafts, "draft");
  section("broken", broken, "broken");
  section("escalated — needs a human", escalated, "escalated");

  if (drafts.length === 0 && broken.length === 0 && escalated.length === 0) {
    io.out("");
    printInfo(io, stones.length === 0 ? "the cairn is empty" : "every stone stands. Nothing to do.");
  }

  return EXIT.OK;

  function section(title: string, files: StoneFile[], status: StoneStatus): void {
    if (files.length === 0) return;
    io.out("");
    io.out(`${paintStatus(status, statusMark(status))} ${pc.bold(title)} ${pc.dim(`(${files.length})`)}`);
    for (const { stone } of files) {
      const suffix =
        stone.status === "broken" && stone.lastGreen
          ? pc.dim(`  last green ${relativeDate(stone.lastGreen.at)}`)
          : "";
      io.out(`  ${pc.dim(abbreviate(stone.id))}  ${stone.title}${suffix}`);
    }
  }
}

function brief(file: StoneFile) {
  return {
    id: file.stone.id,
    title: file.stone.title,
    surface: file.stone.surface ?? null,
    proof: file.stone.proof,
    lastGreen: file.stone.lastGreen,
  };
}
