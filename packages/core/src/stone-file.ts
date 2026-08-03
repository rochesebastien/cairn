import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  DEFAULT_PROOFS_DIR,
  formatIssues,
  stoneSchema,
  type Stone,
  type StoneInput,
} from "./schema.js";

export const STONE_FILE_EXTENSION = ".md";
export const PROOF_FILE_EXTENSION = ".spec.ts";

const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/** Order fields are written in, so files stay diff-stable. */
const FIELD_ORDER = [
  "id",
  "title",
  "status",
  "createdAt",
  "surface",
  "amends",
  "amendedBy",
  "acceptance",
  "provenance",
  "lastGreen",
  "proof",
] as const;

export class StoneFileError extends Error {
  readonly filePath?: string;
  readonly issues?: string[];

  constructor(message: string, options: { filePath?: string; issues?: string[]; cause?: unknown } = {}) {
    super(options.filePath ? `${message} (${options.filePath})` : message, { cause: options.cause });
    this.name = "StoneFileError";
    this.filePath = options.filePath;
    this.issues = options.issues;
  }
}

export interface ParsedStoneFile {
  stone: Stone;
  /** Markdown body = the intent, everything after the frontmatter. */
  body: string;
}

export interface StoneFile extends ParsedStoneFile {
  /** Absolute or caller-relative path the stone was read from. */
  filePath: string;
}

/** Strip a UTF-8 BOM and normalise CRLF / lone CR to LF. */
export function normalizeText(input: string): string {
  return input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

/** Trim leading blank lines and trailing whitespace from a markdown body. */
function normalizeBody(body: string): string {
  return body.replace(/^\n+/, "").replace(/\s+$/, "");
}

/**
 * Parse a stone file (YAML frontmatter + markdown body).
 * Tolerates CRLF line endings and a leading BOM.
 */
export function parseStoneFile(content: string, filePath?: string): ParsedStoneFile {
  const normalized = normalizeText(content);
  const match = FRONTMATTER_RE.exec(normalized);
  if (!match) {
    throw new StoneFileError("Missing YAML frontmatter delimited by ---", { filePath });
  }

  let data: unknown;
  try {
    data = YAML.parse(match[1] ?? "", { prettyErrors: true });
  } catch (cause) {
    throw new StoneFileError("Invalid YAML frontmatter", { filePath, cause });
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new StoneFileError("Frontmatter must be a YAML mapping", { filePath });
  }

  const parsed = stoneSchema.safeParse(data);
  if (!parsed.success) {
    throw new StoneFileError("Invalid stone frontmatter", {
      filePath,
      issues: formatIssues(parsed.error),
    });
  }

  return {
    stone: parsed.data,
    body: normalizeBody(normalized.slice(match[0].length)),
  };
}

/** Serialize a stone to `---\n<yaml>---\n\n<body>\n`. Always LF. */
export function serializeStone(stone: Stone | StoneInput, body = ""): string {
  const validated = stoneSchema.parse(stone);
  const ordered: Record<string, unknown> = {};
  for (const field of FIELD_ORDER) {
    const value = (validated as Record<string, unknown>)[field];
    if (value === undefined) continue;
    ordered[field] = value;
  }

  const yaml = YAML.stringify(ordered, {
    lineWidth: 0,
    // Quote every scalar string so ULIDs, ISO dates and "yes"/"no" style
    // titles survive a parse/serialize round-trip untouched.
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    nullStr: "null",
  });

  const normalizedBody = normalizeBody(normalizeText(body));
  return `---\n${yaml}---\n\n${normalizedBody}${normalizedBody ? "\n" : ""}`;
}

/* ------------------------------------------------------------------ paths */

/** Convert a native path to POSIX separators (stone files are portable). */
export function toPosixPath(p: string): string {
  return p.split(path.sep).join("/").replace(/\\/g, "/");
}

export function stoneFileName(id: string): string {
  return `${id}${STONE_FILE_EXTENSION}`;
}

export function stonePath(stonesDir: string, id: string): string {
  return path.join(stonesDir, stoneFileName(id));
}

export function proofFileName(id: string): string {
  return `${id}${PROOF_FILE_EXTENSION}`;
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
