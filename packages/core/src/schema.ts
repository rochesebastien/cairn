import { z } from "zod";
import { ULID_PATTERN } from "./ulid.js";

/**
 * Zod is the single source of truth for the Cairn domain: the CLI, the MCP
 * server and the desktop app all import these schemas from @cairn/core.
 */

export const ulidSchema = z
  .string()
  .regex(ULID_PATTERN, "must be a canonical (uppercase) ULID");

/** An ISO-8601 instant, e.g. 2026-08-03T10:11:12.000Z */
export const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be an ISO-8601 date string",
  });

export const STONE_STATUSES = [
  "draft",
  "proven",
  "broken",
  "escalated",
  "retired",
] as const;

export const stoneStatusSchema = z.enum(STONE_STATUSES);
export type StoneStatus = z.infer<typeof stoneStatusSchema>;

/** Statuses a stone can still move away from. `retired` is terminal. */
export const ACTIVE_STONE_STATUSES = [
  "draft",
  "proven",
  "broken",
  "escalated",
] as const;

export const provenanceSchema = z.object({
  /** The verbatim user ask that produced this stone. Never paraphrased. */
  request: z.string(),
  attempts: z.number().int().nonnegative().optional(),
  tokens: z.number().int().nonnegative().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const lastGreenSchema = z.object({
  at: isoDateSchema,
  commit: z.string().optional(),
  proofHash: z.string().optional(),
});
export type LastGreen = z.infer<typeof lastGreenSchema>;

export const stoneSchema = z.object({
  id: ulidSchema,
  title: z.string().min(1, "title must not be empty"),
  status: stoneStatusSchema,
  createdAt: isoDateSchema,
  /** Free tag naming the surface the stone lives on ("checkout", "cli", ...). */
  surface: z.string().min(1).optional(),
  /** The stone this one supersedes. */
  amends: ulidSchema.nullable().default(null),
  /** The stone that superseded this one (set when retiring through an amend). */
  amendedBy: ulidSchema.nullable().default(null),
  /** User-language acceptance criteria. See lintAcceptance(). */
  acceptance: z.array(z.string()).default([]),
  provenance: provenanceSchema,
  lastGreen: lastGreenSchema.nullable().default(null),
  /** Path to the proof, relative to the project root. */
  proof: z.string().nullable().default(null),
});

/** The shape a stone has once parsed (defaults applied). */
export type Stone = z.infer<typeof stoneSchema>;
/** The shape accepted as input (defaulted fields optional). */
export type StoneInput = z.input<typeof stoneSchema>;

export const DEFAULT_STONES_DIR = ".cairn/stones";
export const DEFAULT_PROOFS_DIR = ".cairn/proofs";

export const cairnConfigSchema = z.object({
  /** Command that launches the target app before proofs run. */
  start: z.string().optional(),
  /** Base URL the proofs point at. */
  baseURL: z.string().min(1, "baseURL is required"),
  proofsDir: z.string().default(DEFAULT_PROOFS_DIR),
  stonesDir: z.string().default(DEFAULT_STONES_DIR),
  /** Seed command run before verify (fixtures, migrations, ...). */
  setup: z.string().optional(),
  retries: z.number().int().nonnegative().default(0),
});

export type CairnConfig = z.infer<typeof cairnConfigSchema>;
export type CairnConfigInput = z.input<typeof cairnConfigSchema>;

/** Parse + apply defaults, throwing a ZodError on invalid input. */
export function parseStone(value: unknown): Stone {
  return stoneSchema.parse(value);
}

export function safeParseStone(value: unknown) {
  return stoneSchema.safeParse(value);
}

export function parseCairnConfig(value: unknown): CairnConfig {
  return cairnConfigSchema.parse(value);
}

export function safeParseCairnConfig(value: unknown) {
  return cairnConfigSchema.safeParse(value);
}

/** Human-readable rendering of a ZodError, for CLI output. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
