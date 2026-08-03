import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_PROOFS_DIR,
  stoneSchema,
  type Stone,
  type StoneInput,
} from "./schema.js";
import {
  PROOF_FILE_EXTENSION,
  STONE_FILE_EXTENSION,
  StoneFileError,
  parseStoneFile,
  proofFileName,
  serializeStone,
  stoneFileName,
  type ParsedStoneFile,
} from "./stone-parse.js";

/**
 * Filesystem side of the stone file format. The pure parse/serialize half
 * lives in `stone-parse.ts` (browser-safe) and is re-exported here so this
 * module stays the one place the rest of the monorepo imports from.
 */
export {
  PROOF_FILE_EXTENSION,
  STONE_FILE_EXTENSION,
  StoneFileError,
  normalizeText,
  parseStoneFile,
  proofFileName,
  serializeStone,
  stoneFileName,
} from "./stone-parse.js";
export type { ParsedStoneFile } from "./stone-parse.js";

export interface StoneFile extends ParsedStoneFile {
  /** Absolute or caller-relative path the stone was read from. */
  filePath: string;
}

/* ------------------------------------------------------------------ paths */

/** Convert a native path to POSIX separators (stone files are portable). */
export function toPosixPath(p: string): string {
  return p.split(path.sep).join("/").replace(/\\/g, "/");
}

export function stonePath(stonesDir: string, id: string): string {
  return path.join(stonesDir, stoneFileName(id));
}

/** Relative, POSIX-shaped proof path as stored in stone frontmatter. */
export function defaultProofPath(id: string, proofsDir: string = DEFAULT_PROOFS_DIR): string {
  return toPosixPath(path.join(proofsDir, proofFileName(id)));
}

/** Resolve a stone's `proof` field against the project root, natively. */
export function resolveProofPath(projectRoot: string, proof: string): string {
  return path.resolve(projectRoot, ...proof.split("/"));
}

/* --------------------------------------------------------------- fs helpers */

export async function readStone(filePath: string): Promise<StoneFile> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (cause) {
    throw new StoneFileError("Cannot read stone file", { filePath, cause });
  }
  const parsed = parseStoneFile(content, filePath);
  return { ...parsed, filePath };
}

export async function writeStone(
  filePath: string,
  stone: Stone | StoneInput,
  body = "",
): Promise<string> {
  const content = serializeStone(stone, body);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

/** Write `<stonesDir>/<id>.md`, creating the directory when needed. */
export async function writeStoneToDir(
  stonesDir: string,
  stone: Stone | StoneInput,
  body = "",
): Promise<string> {
  const validated = stoneSchema.parse(stone);
  return writeStone(stonePath(stonesDir, validated.id), validated, body);
}

export async function readStoneById(stonesDir: string, id: string): Promise<StoneFile> {
  return readStone(stonePath(stonesDir, id));
}

export interface ListStonesOptions {
  /** "throw" (default) or "skip" malformed files. */
  onError?: "throw" | "skip";
  /** Collector for skipped files when onError is "skip". */
  onSkip?: (filePath: string, error: unknown) => void;
}

/**
 * Read every `*.md` stone in `stonesDir`, sorted by id (= chronological,
 * ULIDs being lexicographically sortable). A missing directory yields [].
 */
export async function listStones(
  stonesDir: string,
  options: ListStonesOptions = {},
): Promise<StoneFile[]> {
  let entries: string[];
  try {
    entries = await readdir(stonesDir);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw new StoneFileError("Cannot list stones directory", { filePath: stonesDir, cause });
  }

  const files = entries
    .filter((name) => name.toLowerCase().endsWith(STONE_FILE_EXTENSION))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const stones: StoneFile[] = [];
  for (const name of files) {
    const filePath = path.join(stonesDir, name);
    try {
      stones.push(await readStone(filePath));
    } catch (error) {
      if (options.onError === "skip") {
        options.onSkip?.(filePath, error);
        continue;
      }
      throw error;
    }
  }
  return stones.sort((a, b) => (a.stone.id < b.stone.id ? -1 : a.stone.id > b.stone.id ? 1 : 0));
}
