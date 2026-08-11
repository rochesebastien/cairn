import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_PROOFS_DIR, DEFAULT_STONES_DIR } from "@usecairn/core";
import { printInfo, printJson, printOk } from "../format.js";
import type { Io } from "../io.js";
import { CAIRN_DIR, fileExists, loadProject } from "../project.js";
import { EXIT } from "../errors.js";

export interface InitOptions {
  dir?: string;
  json?: boolean;
  /** Rewrite cairn.config.ts even when one already exists. */
  force?: boolean;
}

/** Run artifacts a proof run leaves behind. None of them belong in git. */
const GITIGNORE = `# Artifacts produced by \`cairn verify\`. The cairn itself (stones/, proofs/)
# is source and must be committed; everything below is run output.
runs/
reports/
results/
*.log
*.tmp
last-report.json
`;

const CONFIG_TEMPLATE = `/**
 * Cairn configuration.
 *
 * Loaded by \`cairn verify\` through jiti, so TypeScript needs no build step.
 * Add \`/** @type {import("@usecairn/core").CairnConfigInput} *\\/\` above the
 * export if you want editor completion inside a project that depends on
 * @usecairn/core.
 */
export default {
  /**
   * How to start the app the proofs run against. Cairn does not start it
   * itself: it exports the command as CAIRN_START (and baseURL as
   * CAIRN_BASE_URL) so your playwright.config can own the lifecycle:
   *
   *   webServer: { command: process.env.CAIRN_START, url: process.env.CAIRN_BASE_URL }
   */
  start: "npm run dev",

  /** Where the proofs point. Also exported to proofs as CAIRN_BASE_URL. */
  baseURL: "http://localhost:3000",

  /** Optional command run once before a verify run (fixtures, migrations...). */
  // setup: "npm run seed",

  /** Retries per proof. Proofs are meant to be deterministic: keep this low. */
  retries: 0,

  /** Where stones and proofs live. Both are relative to this file. */
  stonesDir: "${DEFAULT_STONES_DIR}",
  proofsDir: "${DEFAULT_PROOFS_DIR}",
};
`;

interface Created {
  path: string;
  created: boolean;
}

async function ensureDir(target: string): Promise<Created> {
  const existed = await fileExists(target);
  if (!existed) await mkdir(target, { recursive: true });
  return { path: target, created: !existed };
}

async function ensureFile(target: string, content: string, force = false): Promise<Created> {
  const existed = await fileExists(target);
  if (!existed || force) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return { path: target, created: true };
  }
  return { path: target, created: false };
}

/**
 * Raise an empty cairn. Idempotent: running it twice never destroys anything,
 * and reports what was already there.
 */
export async function initCommand(io: Io, options: InitOptions = {}): Promise<number> {
  // `--dir` is taken verbatim here: init is how a cairn comes into existence,
  // so it must not walk up and adopt a parent project's cairn.
  const project = await loadProject({ dir: options.dir, exact: true });

  const results: Created[] = [];
  results.push(await ensureDir(project.cairnDir));
  results.push(await ensureDir(project.stonesDir));
  results.push(await ensureDir(project.proofsDir));
  results.push(await ensureFile(path.join(project.cairnDir, ".gitignore"), GITIGNORE));
  results.push(
    await ensureFile(path.join(project.root, "cairn.config.ts"), CONFIG_TEMPLATE, options.force),
  );

  const relative = (target: string): string => path.relative(project.root, target) || ".";

  if (options.json) {
    printJson(io, {
      ok: true,
      root: project.root,
      cairnDir: relative(project.cairnDir),
      stonesDir: relative(project.stonesDir),
      proofsDir: relative(project.proofsDir),
      entries: results.map((entry) => ({ path: relative(entry.path), created: entry.created })),
    });
    return EXIT.OK;
  }

  const fresh = results.filter((entry) => entry.created);
  if (fresh.length === 0) {
    printOk(io, `the cairn in ${project.root} is already standing`);
  } else {
    printOk(io, `cairn raised in ${project.root}`);
  }
  for (const entry of results) {
    const label = entry.created ? "created" : "exists";
    printInfo(io, `${label.padEnd(7)} ${relative(entry.path)}${entry.path === project.cairnDir ? `/` : ""}`);
  }
  if (fresh.length > 0) {
    io.out("");
    printInfo(io, `next: cairn add --title "..." --acceptance "..." --request "..."`);
  }

  return EXIT.OK;
}

export const __testing = { GITIGNORE, CONFIG_TEMPLATE, CAIRN_DIR };
