import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_PROOFS_DIR,
  DEFAULT_STONES_DIR,
  formatIssues,
  listStones,
  normalizeUlid,
  readStoneById,
  safeParseCairnConfig,
  type CairnConfig,
  type StoneFile,
} from "@cairn/core";
import { z } from "zod";
import { CliError, usageError } from "./errors.js";

export const CAIRN_DIR = ".cairn";
export const CONFIG_BASENAME = "cairn.config";
export const CONFIG_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;

/** Used when a project has no cairn.config.* yet. */
export const FALLBACK_CONFIG: CairnConfig = {
  baseURL: "http://localhost:3000",
  proofsDir: DEFAULT_PROOFS_DIR,
  stonesDir: DEFAULT_STONES_DIR,
  retries: 0,
};

export interface Project {
  /** Absolute path to the project root (the directory holding `.cairn/`). */
  root: string;
  /** Absolute path to `<root>/.cairn`. */
  cairnDir: string;
  /** Absolute path to the stones directory, from the config. */
  stonesDir: string;
  /** Absolute path to the proofs directory, from the config. */
  proofsDir: string;
  config: CairnConfig;
  /** Absolute path to the loaded config, or null when defaults were used. */
  configPath: string | null;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk up from `start` looking for a directory that owns a cairn (a `.cairn/`
 * folder or a cairn.config.*). Falls back to `start` itself, so `cairn init`
 * works in a fresh directory.
 */
export async function findProjectRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await exists(path.join(current, CAIRN_DIR))) return current;
    for (const ext of CONFIG_EXTENSIONS) {
      if (await exists(path.join(current, `${CONFIG_BASENAME}${ext}`))) return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start);
    current = parent;
  }
}

export async function findConfigPath(root: string): Promise<string | null> {
  for (const ext of CONFIG_EXTENSIONS) {
    const candidate = path.join(root, `${CONFIG_BASENAME}${ext}`);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Load a cairn.config.* through jiti, so a TypeScript config needs no build
 * step. Plain `.mjs`/`.js` configs are imported natively first (cheaper, and
 * it keeps jiti out of the hot path for JS projects).
 */
export async function loadConfigFile(configPath: string): Promise<CairnConfig> {
  let raw: unknown;

  const ext = path.extname(configPath);
  if (ext === ".mjs" || ext === ".js") {
    try {
      const mod = (await import(pathToFileURL(configPath).href)) as Record<string, unknown>;
      raw = mod.default ?? mod;
    } catch {
      raw = await loadWithJiti(configPath);
    }
  } else {
    raw = await loadWithJiti(configPath);
  }

  if (typeof raw === "function") {
    raw = await (raw as () => unknown)();
  }

  const parsed = safeParseCairnConfig(raw);
  if (!parsed.success) {
    throw new CliError(`Invalid config: ${path.basename(configPath)}`, {
      details: formatIssues(parsed.error as z.ZodError),
    });
  }
  return parsed.data;
}

async function loadWithJiti(configPath: string): Promise<unknown> {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  try {
    const mod = (await jiti.import(configPath, {})) as Record<string, unknown>;
    return (mod as { default?: unknown }).default ?? mod;
  } catch (cause) {
    throw new CliError(`Cannot load ${path.basename(configPath)}`, {
      details: [String((cause as Error)?.message ?? cause)],
      cause,
    });
  }
}

export interface LoadProjectOptions {
  /** `--dir`, defaults to the process cwd. */
  dir?: string;
  /** Skip the walk up the tree and use `dir` verbatim (used by `init`). */
  exact?: boolean;
}

export async function loadProject(options: LoadProjectOptions = {}): Promise<Project> {
  const start = path.resolve(options.dir ?? process.cwd());
  const root = options.exact ? start : await findProjectRoot(start);
  const configPath = await findConfigPath(root);
  const config = configPath ? await loadConfigFile(configPath) : FALLBACK_CONFIG;

  return {
    root,
    cairnDir: path.join(root, CAIRN_DIR),
    stonesDir: path.resolve(root, ...config.stonesDir.split("/")),
    proofsDir: path.resolve(root, ...config.proofsDir.split("/")),
    config,
    configPath,
  };
}

/** Fail with a friendly message when the project has no cairn yet. */
export async function requireCairn(project: Project): Promise<void> {
  if (await exists(project.stonesDir)) return;
  throw new CliError(`No cairn found in ${project.root}`, {
    details: ["Run `cairn init` first."],
  });
}

export interface StoneCollection {
  stones: StoneFile[];
  /** Files that could not be parsed: reported, never silently swallowed. */
  skipped: string[];
}

/** Every stone in the cairn, sorted by id (chronological). */
export async function readAllStones(project: Project): Promise<StoneCollection> {
  const skipped: string[] = [];
  const stones = await listStones(project.stonesDir, {
    onError: "skip",
    onSkip: (filePath, error) => {
      skipped.push(`${path.basename(filePath)}: ${(error as Error)?.message ?? error}`);
    },
  });
  return { stones, skipped };
}

/**
 * Resolve what a human typed to a full stone id.
 *
 * `cairn list` prints 8-character short ids, so those short ids have to be
 * accepted back: anything that is a unique prefix of exactly one stone wins.
 * An ambiguous prefix is refused with the candidates rather than guessed at.
 */
export function resolveStoneId(known: readonly string[], query: string): string {
  const wanted = normalizeUlid(query);
  if (known.includes(wanted)) return wanted;

  const matches = known.filter((id) => id.startsWith(wanted));
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw usageError(
      `Ambiguous stone id ${wanted}: ${matches.length} stones start with it`,
      matches.map((id) => `  ${id}`).concat("Pass more characters, or `cairn list --long`."),
    );
  }
  throw usageError(`No stone with id ${wanted}`, []);
}

/** Read one stone by full id or unique prefix, with a helpful error when there is none. */
export async function readOneStone(project: Project, id: string): Promise<StoneFile> {
  const where = `Looked in ${path.relative(project.root, project.stonesDir) || project.stonesDir}`;
  try {
    return await readStoneById(project.stonesDir, normalizeUlid(id));
  } catch {
    // Not a full id: it may still be a short id copied out of `cairn list`.
  }

  const { stones } = await readAllStones(project);
  let resolved: string;
  try {
    resolved = resolveStoneId(
      stones.map((file) => file.stone.id),
      id,
    );
  } catch (error) {
    if (error instanceof CliError) throw usageError(error.message, [...error.details, where]);
    throw error;
  }

  const found = stones.find((file) => file.stone.id === resolved);
  if (!found) throw usageError(`No stone with id ${normalizeUlid(id)}`, [where]);
  return found;
}

export async function fileExists(target: string): Promise<boolean> {
  return exists(target);
}

export async function readFileOrNull(target: string): Promise<string | null> {
  try {
    return await readFile(target, "utf8");
  } catch {
    return null;
  }
}
