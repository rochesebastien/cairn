import path from "node:path";
import {
  amendChain,
  checkIntegrity,
  normalizeUlid,
  resolveProofPath,
  shortHash,
} from "@cairn/core";
import pc from "picocolors";
import { EXIT } from "../errors.js";
import { paintStatus, printJson, relativeDate, statusMark } from "../format.js";
import type { Io } from "../io.js";
import { loadProject, readAllStones, readFileOrNull, readOneStone, requireCairn } from "../project.js";
import { stoneJson } from "./list.js";

export interface ShowOptions {
  dir?: string;
  json?: boolean;
}

/** Everything known about one stone, including its lineage and proof state. */
export async function showCommand(io: Io, id: string, options: ShowOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const file = await readOneStone(project, normalizeUlid(id));
  const { stone } = file;

  const proofPath = stone.proof ? resolveProofPath(project.root, stone.proof) : null;
  const proofContent = proofPath ? await readFileOrNull(proofPath) : null;
  const integrity = checkIntegrity(stone, proofContent);

  const { stones } = await readAllStones(project);
  const chain = amendChain(
    stones.map((entry) => entry.stone),
    stone.id,
  );

  if (options.json) {
    printJson(io, {
      ok: true,
      stone: stoneJson(file, project.root),
      integrity,
      lineage: chain.map((entry) => ({
        id: entry.id,
        status: entry.status,
        title: entry.title,
        current: entry.id === stone.id,
      })),
    });
    return EXIT.OK;
  }

  io.out(`${paintStatus(stone.status, statusMark(stone.status))} ${pc.bold(stone.title)}`);
  io.out(pc.dim(`  ${stone.id}`));
  io.out("");
  line("status", paintStatus(stone.status));
  line("created", `${stone.createdAt} ${pc.dim(`(${relativeDate(stone.createdAt)})`)}`);
  if (stone.surface) line("surface", stone.surface);
  line("file", path.relative(project.root, file.filePath));
  line("proof", stone.proof ?? pc.dim("none"));
  if (stone.proof) {
    line(
      "integrity",
      integrity.ok
        ? pc.green(integrity.status)
        : `${pc.red(integrity.status)} ${pc.dim(integrity.message)}`,
    );
  }
  line(
    "last green",
    stone.lastGreen
      ? `${stone.lastGreen.at} ${pc.dim(
          [
            stone.lastGreen.commit ? `commit ${stone.lastGreen.commit.slice(0, 8)}` : "",
            stone.lastGreen.proofHash ? `proof ${shortHash(stone.lastGreen.proofHash)}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        )}`
      : pc.dim("never"),
  );
  if (stone.amends) line("amends", stone.amends);
  if (stone.amendedBy) line("amended by", stone.amendedBy);

  io.out("");
  io.out(pc.bold("acceptance"));
  if (stone.acceptance.length === 0) io.out(pc.dim("  (none)"));
  for (const [index, criterion] of stone.acceptance.entries()) {
    io.out(`  ${pc.dim(`${index + 1}.`)} ${criterion}`);
  }

  io.out("");
  io.out(pc.bold("request") + pc.dim("  (verbatim)"));
  io.out(`  ${stone.provenance.request}`);
  const meta = [
    stone.provenance.attempts !== undefined ? `attempts ${stone.provenance.attempts}` : "",
    stone.provenance.tokens !== undefined ? `tokens ${stone.provenance.tokens}` : "",
  ].filter(Boolean);
  if (meta.length > 0) io.out(pc.dim(`  ${meta.join(" · ")}`));

  if (file.body.trim().length > 0) {
    io.out("");
    io.out(pc.bold("intent"));
    for (const bodyLine of file.body.split("\n")) io.out(`  ${bodyLine}`);
  }

  if (chain.length > 1) {
    io.out("");
    io.out(pc.bold("lineage"));
    for (const entry of chain) {
      const marker = entry.id === stone.id ? pc.cyan("→") : " ";
      io.out(
        `  ${marker} ${paintStatus(entry.status, statusMark(entry.status))} ${pc.dim(entry.id)}  ${entry.title}`,
      );
    }
  }

  return EXIT.OK;

  function line(label: string, value: string): void {
    io.out(`  ${pc.dim(label.padEnd(11))}${value}`);
  }
}
