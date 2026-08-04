import YAML from "yaml";
import {
  formatIssues,
  stoneSchema,
  type Stone,
  type StoneInput,
} from "./schema.js";

/**
 * The pure half of the stone file format: parse and serialize, no filesystem.
 *
 * This module deliberately imports nothing from `node:*` so it can be bundled
 * for the browser (the desktop app reads files through Tauri, then parses them
 * with exactly the same code the CLI uses). Path helpers and fs helpers live in
 * `stone-file.ts`, which re-exports everything below — the public API of
 * @cairn/core is unchanged.
 */

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

export function stoneFileName(id: string): string {
  return `${id}${STONE_FILE_EXTENSION}`;
}

export function proofFileName(id: string): string {
  return `${id}${PROOF_FILE_EXTENSION}`;
}
