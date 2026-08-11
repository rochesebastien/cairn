import { lintAcceptance, type Provenance, type Violation } from "@usecairn/core";
import { usageError } from "./errors.js";
import type { Io } from "./io.js";

/**
 * `add` and `amend` take the same content, from three interchangeable sources:
 * flags (first class, so agents never need a TTY), a JSON payload on stdin
 * (`--json`), or an interactive prompt when a human runs the bare command.
 */
export interface ContentFlags {
  title?: string;
  intent?: string;
  acceptance?: string[];
  surface?: string;
  request?: string;
  attempts?: number;
  tokens?: number;
  /** `--proof` with no value means "use the default path for this stone". */
  proof?: string | boolean;
  json?: boolean;
  force?: boolean;
}

export interface StoneContent {
  title?: string;
  /** Markdown body: the intent. */
  intent: string;
  acceptance: string[];
  surface?: string;
  provenance?: Provenance;
  proof?: string | boolean;
}

const payloadKeys = [
  "title",
  "intent",
  "body",
  "acceptance",
  "surface",
  "request",
  "provenance",
  "attempts",
  "tokens",
  "proof",
] as const;

interface JsonPayload {
  title?: unknown;
  intent?: unknown;
  body?: unknown;
  acceptance?: unknown;
  surface?: unknown;
  request?: unknown;
  provenance?: { request?: unknown; attempts?: unknown; tokens?: unknown };
  attempts?: unknown;
  tokens?: unknown;
  proof?: unknown;
}

function asStringArray(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw usageError(`"${field}" must be an array of strings`);
  }
  return value as string[];
}

function asString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw usageError(`"${field}" must be a string`);
  return value;
}

function asNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) {
    throw usageError(`"${field}" must be a non-negative number`);
  }
  return Math.trunc(num);
}

/** Parse the `--json` stdin payload into content. Flags still win over it. */
export async function readJsonPayload(io: Io): Promise<StoneContent> {
  const raw = (await io.readStdin()).trim();
  if (!raw) throw usageError("--json expects a JSON payload on stdin, but stdin was empty");
  return parseJsonPayload(raw);
}

/** Parse a JSON payload string into stone content. */
export function parseJsonPayload(raw: string): StoneContent {
  let payload: JsonPayload;
  try {
    payload = JSON.parse(raw) as JsonPayload;
  } catch (cause) {
    throw usageError("--json payload is not valid JSON", [String((cause as Error).message)]);
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw usageError("--json payload must be a JSON object", [
      `Known fields: ${payloadKeys.join(", ")}`,
    ]);
  }

  const request =
    asString(payload.provenance?.request, "provenance.request") ??
    asString(payload.request, "request");
  const attempts =
    asNumber(payload.provenance?.attempts, "provenance.attempts") ??
    asNumber(payload.attempts, "attempts");
  const tokens =
    asNumber(payload.provenance?.tokens, "provenance.tokens") ?? asNumber(payload.tokens, "tokens");

  const content: StoneContent = {
    title: asString(payload.title, "title"),
    intent: asString(payload.intent, "intent") ?? asString(payload.body, "body") ?? "",
    acceptance: asStringArray(payload.acceptance, "acceptance"),
    surface: asString(payload.surface, "surface"),
    proof:
      typeof payload.proof === "boolean" ? payload.proof : asString(payload.proof, "proof"),
  };
  if (request !== undefined) {
    content.provenance = {
      request,
      ...(attempts !== undefined ? { attempts } : {}),
      ...(tokens !== undefined ? { tokens } : {}),
    };
  }
  return content;
}

/** Ask a human for the content when nothing was passed on the command line. */
export async function promptForContent(io: Io, base: StoneContent): Promise<StoneContent> {
  const title = base.title ?? (await io.question("Title: ")).trim();
  const intent = base.intent || (await io.question("Intent (one line, optional): ")).trim();

  const acceptance = [...base.acceptance];
  if (acceptance.length === 0) {
    io.out("Acceptance criteria, in user language. Empty line to finish.");
    for (;;) {
      const line = (await io.question(`  ${acceptance.length + 1}. `)).trim();
      if (!line) break;
      acceptance.push(line);
    }
  }

  const request =
    base.provenance?.request ?? (await io.question("Verbatim request (provenance): ")).trim();

  return {
    ...base,
    title: title || undefined,
    intent,
    acceptance,
    ...(request ? { provenance: { ...base.provenance, request } } : {}),
  };
}

/** Merge the three sources, flags last so they always win. */
export function mergeContent(base: StoneContent, flags: ContentFlags): StoneContent {
  const request = flags.request ?? base.provenance?.request;
  const attempts = flags.attempts ?? base.provenance?.attempts;
  const tokens = flags.tokens ?? base.provenance?.tokens;

  return {
    title: flags.title ?? base.title,
    intent: flags.intent ?? base.intent ?? "",
    acceptance: flags.acceptance?.length ? flags.acceptance : base.acceptance,
    surface: flags.surface ?? base.surface,
    proof: flags.proof ?? base.proof,
    ...(request !== undefined
      ? {
          provenance: {
            request,
            ...(attempts !== undefined ? { attempts } : {}),
            ...(tokens !== undefined ? { tokens } : {}),
          },
        }
      : {}),
  };
}

/**
 * Resolve content from flags + optional stdin payload + optional prompt.
 *
 * `--json` means "answer in JSON, and take a payload from stdin if there is
 * one": an agent that already has everything in flags must not be forced to
 * pipe an empty object in, and a `--json` run from a terminal must never hang
 * waiting on a stdin nobody is going to write to.
 */
export async function resolveContent(io: Io, flags: ContentFlags): Promise<StoneContent> {
  let base: StoneContent = { intent: "", acceptance: [] };
  if (flags.json && !io.isTTY) {
    const raw = (await io.readStdin()).trim();
    if (raw) base = parseJsonPayload(raw);
  }

  let content = mergeContent(base, flags);

  const needsInput = !content.title || content.acceptance.length === 0;
  if (needsInput && !flags.json && io.isTTY) {
    content = mergeContent(await promptForContent(io, content), { ...flags, title: undefined });
  }
  return content;
}

export interface LintOutcome {
  violations: Violation[];
  /** True when creation may proceed (clean, or `--force`). */
  allowed: boolean;
}

/** Acceptance criteria are user language. This is where that is enforced. */
export function lintContent(content: StoneContent, force = false): LintOutcome {
  const violations = lintAcceptance(content.acceptance);
  return { violations, allowed: violations.length === 0 || force };
}
