import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseRunLedger,
  parseStoneFile,
  serializeRunEvent,
  type ParsedStoneFile,
  type RunEvent,
  type RunEventInput,
} from "@cairn/core";
import { memoryIo } from "../src/io.js";
import { run } from "../src/program.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** The stub that stands in for `playwright test`. */
export const STUB_RUNNER = `node ${JSON.stringify(path.join(here, "fixtures", "stub-runner.mjs"))}`;

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON; throws when it is not JSON. */
  json<T = unknown>(): T;
}

export interface CliOptions {
  /** Project directory; passed as --dir unless the args already carry one. */
  cwd?: string;
  stdin?: string;
  isTTY?: boolean;
  answers?: string[];
}

/**
 * Run the CLI in-process, exactly the way `bin.ts` does, and capture what a
 * user would have seen. Colours are disabled through NO_COLOR in setup.ts.
 */
export async function cli(args: string[], options: CliOptions = {}): Promise<CliResult> {
  const io = memoryIo({
    ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
    ...(options.isTTY !== undefined ? { isTTY: options.isTTY } : {}),
    ...(options.answers ? { answers: options.answers } : {}),
  });

  const withDir =
    options.cwd && !args.includes("--dir") && !args.includes("-C")
      ? [...args, "--dir", options.cwd]
      : args;

  const code = await run(withDir, io);
  const stdout = io.stdout.join("\n");
  const stderr = io.stderr.join("\n");

  return {
    code,
    stdout,
    stderr,
    json<T = unknown>(): T {
      try {
        return JSON.parse(stdout) as T;
      } catch (cause) {
        throw new Error(`stdout is not JSON:\n${stdout}\n${stderr}`, { cause });
      }
    },
  };
}

export interface TempProject {
  root: string;
  cleanup(): Promise<void>;
  /** Absolute path inside the project. */
  path(...segments: string[]): string;
  read(...segments: string[]): Promise<string>;
  write(relative: string, content: string): Promise<void>;
  /** Read a stone file by id. */
  stone(id: string): Promise<ParsedStoneFile>;
  /** Write a proof file for a stone id and return its POSIX relative path. */
  proof(id: string, content?: string): Promise<string>;
  /** Read a stone's run ledger. An absent ledger reads as no events. */
  ledger(id: string): Promise<RunEvent[]>;
  /** Hand-write a run ledger, to set up histories no run could produce here. */
  writeLedger(id: string, events: RunEventInput[]): Promise<void>;
}

export async function makeProject(): Promise<TempProject> {
  // realpath: macOS temp dirs are symlinks, and the CLI resolves paths.
  const root = await mkdtemp(path.join(await realTmp(), "cairn-cli-"));

  const project: TempProject = {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
    path(...segments) {
      return path.join(root, ...segments);
    },
    async read(...segments) {
      return readFile(path.join(root, ...segments), "utf8");
    },
    async write(relative, content) {
      await writeFile(path.join(root, ...relative.split("/")), content, "utf8");
    },
    async stone(id) {
      return parseStoneFile(await project.read(".cairn", "stones", `${id}.md`));
    },
    async proof(id, content = "// proof\n") {
      await project.write(`.cairn/proofs/${id}.spec.ts`, content);
      return `.cairn/proofs/${id}.spec.ts`;
    },
    async ledger(id) {
      try {
        return parseRunLedger(await project.read(".cairn", "runs", `${id}.jsonl`)).events;
      } catch {
        return [];
      }
    },
    async writeLedger(id, events) {
      await mkdir(path.join(root, ".cairn", "runs"), { recursive: true });
      await writeFile(
        path.join(root, ".cairn", "runs", `${id}.jsonl`),
        events.map(serializeRunEvent).join(""),
        "utf8",
      );
    },
  };

  return project;
}

async function realTmp(): Promise<string> {
  const { realpath } = await import("node:fs/promises");
  try {
    return await realpath(tmpdir());
  } catch {
    return tmpdir();
  }
}

/** init + one draft stone, returning its id. */
export async function seedStone(
  project: TempProject,
  overrides: string[] = [],
): Promise<string> {
  const result = await cli(
    [
      "add",
      "--title",
      "Le panier affiche le total",
      "--acceptance",
      "the shopper sees the total including tax",
      "--request",
      "je veux voir le total dans le panier",
      "--json",
      ...overrides,
    ],
    { cwd: project.root, stdin: "{}" },
  );
  if (result.code !== 0) throw new Error(`seed failed: ${result.stdout}\n${result.stderr}`);
  return result.json<{ stone: { id: string } }>().stone.id;
}

export interface StubEnv {
  results?: Record<string, "passed" | "failed" | "skipped" | "absent">;
  mode?: "crash";
  log?: string;
}

/**
 * Point the CLI at the stub runner for the duration of a call. Returns the
 * `--runner` argument plus the env it needs (set through process.env, which
 * the spawned stub inherits).
 */
export function withStub(env: StubEnv = {}): { args: string[]; restore(): void } {
  const previous = {
    results: process.env.CAIRN_STUB_RESULTS,
    mode: process.env.CAIRN_STUB_MODE,
    log: process.env.CAIRN_STUB_LOG,
  };

  if (env.results) process.env.CAIRN_STUB_RESULTS = JSON.stringify(env.results);
  else delete process.env.CAIRN_STUB_RESULTS;
  if (env.mode) process.env.CAIRN_STUB_MODE = env.mode;
  else delete process.env.CAIRN_STUB_MODE;
  if (env.log) process.env.CAIRN_STUB_LOG = env.log;
  else delete process.env.CAIRN_STUB_LOG;

  return {
    args: ["--runner", STUB_RUNNER],
    restore() {
      restoreEnv("CAIRN_STUB_RESULTS", previous.results);
      restoreEnv("CAIRN_STUB_MODE", previous.mode);
      restoreEnv("CAIRN_STUB_LOG", previous.log);
    },
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
