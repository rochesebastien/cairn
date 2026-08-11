/**
 * The Cairn MCP server.
 *
 * It exposes the cairn of one target project (`--dir` / `CAIRN_DIR`) over the
 * Model Context Protocol: eight tools and three resources, all of them thin
 * wrappers over @usecairn/core and the helpers @usecairn/cli exports.
 *
 * The one rule that lives *here* rather than in a skill prompt: `create_draft`
 * and `amend_stone` run the acceptance lint and refuse when it fails. There is
 * no `force` over MCP — an agent cannot argue its way past the guard-rail.
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import {
  IllegalTransitionError,
  STONE_STATUSES,
  StoneFileError,
  stoneStatusSchema,
} from "@usecairn/core";
import { CliError, EXIT } from "@usecairn/cli";
import { z } from "zod";
import {
  amendStoneOp,
  cairnPayload,
  createDraftOp,
  getEscalationsOp,
  getStoneOp,
  lintAcceptanceOp,
  listStonesOp,
  recordRunOp,
  retireStoneOp,
  statusPayload,
  stonePayload,
  type CairnTarget,
  type OperationResult,
} from "./operations.js";

export const SERVER_NAME = "cairn";
export const VERSION = "0.1.0";

export const RESOURCE_URIS = {
  stones: "cairn://stones",
  status: "cairn://status",
  stone: "cairn://stone/{id}",
} as const;

export interface CairnServerOptions {
  /** Root of the project whose cairn is exposed. Defaults to the cwd. */
  dir?: string;
}

/* --------------------------------------------------------------- results */

const JSON_MIME = "application/json";

function toolResult(result: OperationResult): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result.payload, null, 2) }],
    structuredContent: result.payload,
    ...(result.isError ? { isError: true } : {}),
  };
}

/** Turn a thrown error into a structured, machine-readable tool failure. */
function errorResult(error: unknown): OperationResult {
  if (error instanceof CliError) {
    return {
      isError: true,
      payload: {
        ok: false,
        error: error.exitCode === EXIT.REFUSED ? "refused" : "cairn-error",
        message: error.message,
        details: error.details,
        exitCode: error.exitCode,
      },
    };
  }
  if (error instanceof StoneFileError) {
    return {
      isError: true,
      payload: {
        ok: false,
        error: "unreadable-stone",
        message: error.message,
        details: error.issues ?? [],
      },
    };
  }
  if (error instanceof IllegalTransitionError) {
    return {
      isError: true,
      payload: {
        ok: false,
        error: "illegal-transition",
        message: error.message,
        from: error.from,
        to: error.to,
      },
    };
  }
  return {
    isError: true,
    payload: {
      ok: false,
      error: "internal",
      message: (error as Error)?.message ?? String(error),
    },
  };
}

/** Never throw at the protocol level: a failure is a structured tool result. */
async function guarded(run: () => Promise<OperationResult> | OperationResult): Promise<CallToolResult> {
  try {
    return toolResult(await run());
  } catch (error) {
    return toolResult(errorResult(error));
  }
}

function jsonResource(uri: URL, payload: unknown): ReadResourceResult {
  return {
    contents: [{ uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify(payload, null, 2) }],
  };
}

/* ------------------------------------------------------------ the server */

const idField = z
  .string()
  .min(1)
  .describe("Stone id: a full 26-character ULID, or any prefix that is unique in this cairn.");

const acceptanceField = z
  .array(z.string())
  .describe(
    "Acceptance criteria in user language — what a user sees. Selectors, HTTP routes, " +
      "camelCase identifiers, file paths and function calls are refused.",
  );

const proofField = z
  .union([z.string(), z.boolean()])
  .describe(
    "Proof path relative to the project root, or true for the conventional " +
      "<proofsDir>/<id>.spec.ts. Omit it when the warden has not written the proof yet.",
  );

export function createCairnServer(options: CairnServerOptions = {}): McpServer {
  const target: CairnTarget = { dir: options.dir ?? process.cwd() };

  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION, title: "Cairn" },
    {
      instructions:
        "Cairn is the feature registry of this project: the cairn in .cairn/, one stone per " +
        "feature, one deterministic Playwright proof per stone. Read the cairn with list_stones, " +
        "get_stone and the cairn:// resources. Raise a stone with create_draft; never edit a " +
        "stone — amend_stone supersedes it and retires the old one. Acceptance criteria are " +
        "user language: lint_acceptance tells you before create_draft/amend_stone refuse you.",
    },
  );

  /* ----------------------------------------------------------- read tools */

  server.registerTool(
    "list_stones",
    {
      title: "List stones",
      description:
        "List the stones of the cairn, newest last. Retired stones are hidden unless asked for.",
      inputSchema: {
        status: stoneStatusSchema
          .optional()
          .describe(`Keep only this status (${STONE_STATUSES.join(", ")}).`),
        surface: z
          .string()
          .optional()
          .describe('Keep only stones on this surface tag ("checkout", "cli", ...).'),
        includeRetired: z
          .boolean()
          .optional()
          .describe("Include retired stones. Ignored when `status` is given."),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => guarded(() => listStonesOp(target, input)),
  );

  server.registerTool(
    "get_stone",
    {
      title: "Get a stone",
      description:
        "Read one stone in full: frontmatter, intent body and the path it lives at. " +
        "Accepts a unique id prefix, the same way the CLI does.",
      inputSchema: { id: idField },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => guarded(() => getStoneOp(target, { id })),
  );

  server.registerTool(
    "get_escalations",
    {
      title: "Get escalations",
      description:
        "Every stone waiting on a human: the coder/warden loop spent its budget. " +
        "An escalated stone only leaves that status through amend_stone or retire_stone.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => guarded(() => getEscalationsOp(target)),
  );

  server.registerTool(
    "lint_acceptance",
    {
      title: "Lint acceptance criteria",
      description:
        "Judge acceptance criteria without writing anything. Returns one violation per " +
        "offending fragment. This is the very lint create_draft and amend_stone enforce.",
      inputSchema: { criteria: acceptanceField },
      annotations: { readOnlyHint: true },
    },
    async ({ criteria }) => guarded(() => lintAcceptanceOp({ criteria })),
  );

  /* ---------------------------------------------------------- write tools */

  server.registerTool(
    "create_draft",
    {
      title: "Create a draft stone",
      description:
        "Raise a new draft stone. Refused when the acceptance criteria leak implementation " +
        "detail — rewrite them in user language, there is no force here.",
      inputSchema: {
        title: z.string().min(1).describe("One line, in the user's words."),
        request: z
          .string()
          .min(1)
          .describe("Provenance: the verbatim user ask that produced this stone. Never paraphrase."),
        intent: z.string().optional().describe("Markdown body: why this stone exists."),
        acceptance: acceptanceField.optional(),
        surface: z.string().optional().describe('Surface tag ("checkout", "cli", ...).'),
        attempts: z.number().int().nonnegative().optional().describe("Attempts spent so far."),
        tokens: z.number().int().nonnegative().optional().describe("Tokens spent so far."),
        proof: proofField.optional(),
      },
    },
    async (input) => guarded(() => createDraftOp(target, input)),
  );

  server.registerTool(
    "amend_stone",
    {
      title: "Amend a stone",
      description:
        "Stones are never edited. This raises a new draft that supersedes the given stone and " +
        "retires it, recording the lineage both ways. Omitted fields are inherited. Refused " +
        "when the resulting acceptance criteria leak implementation detail.",
      inputSchema: {
        id: idField,
        title: z.string().optional(),
        request: z.string().optional().describe("New verbatim user ask, when there is one."),
        intent: z.string().optional(),
        acceptance: acceptanceField.optional().describe(
          "New acceptance criteria. Omit or leave empty to inherit the amended stone's.",
        ),
        surface: z.string().optional(),
        attempts: z.number().int().nonnegative().optional(),
        tokens: z.number().int().nonnegative().optional(),
        proof: proofField.optional(),
        carryProof: z
          .boolean()
          .optional()
          .describe("Copy the retired stone's proof over to the new draft, to rework it in place."),
      },
    },
    async (input) => guarded(() => amendStoneOp(target, input)),
  );

  server.registerTool(
    "retire_stone",
    {
      title: "Retire a stone",
      description:
        "Retire a stone: its proof leaves the active suite. Retired is terminal — use " +
        "amend_stone when the feature is changing rather than disappearing.",
      inputSchema: { id: idField },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => guarded(() => retireStoneOp(target, { id })),
  );

  server.registerTool(
    "record_run",
    {
      title: "Record a proof run",
      description:
        "Fold the result of a proof run into a stone, exactly as `cairn verify` does: green " +
        "proves a draft or repairs a broken stone and stamps lastGreen (commit + sha256 of the " +
        "proof); red breaks a proven stone but leaves a draft a draft; missing breaks a proven " +
        "stone whose proof vanished. Escalated and retired stones never move.",
      inputSchema: {
        stoneId: idField,
        result: z
          .enum(["green", "red", "missing"])
          .describe("Outcome of the proof: green, red, or missing (no proof file ran)."),
        runMeta: z
          .object({
            at: z.string().optional().describe("ISO instant of the run. Defaults to now."),
            commit: z.string().optional().describe("Commit the run happened on. Defaults to HEAD."),
            proofHash: z
              .string()
              .optional()
              .describe("sha256 of the proof. Computed from disk when omitted on a run."),
            tokens: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe("Tokens this attempt cost. Recorded in the run ledger, never guessed."),
            proofEdited: z
              .boolean()
              .optional()
              .describe(
                "Whether the proof was rewritten before this attempt. Inferred from the " +
                  "recorded hashes when omitted.",
              ),
          })
          .optional(),
      },
    },
    async (input) => guarded(() => recordRunOp(target, input)),
  );

  /* ------------------------------------------------------------ resources */

  server.registerResource(
    "cairn",
    RESOURCE_URIS.stones,
    {
      title: "The cairn",
      description: "Every stone of the target project, retired ones included, as JSON.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonResource(uri, await cairnPayload(target)),
  );

  server.registerResource(
    "cairn-status",
    RESOURCE_URIS.status,
    {
      title: "Cairn status",
      description:
        "The synthesis an agent reads before deciding what to do next: counts per status, " +
        "proof coverage, and the drafts, broken and escalated stones.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonResource(uri, await statusPayload(target)),
  );

  server.registerResource(
    "stone",
    new ResourceTemplate(RESOURCE_URIS.stone, {
      list: async () => {
        const cairn = (await cairnPayload(target)) as { stones: { id: string; title: string }[] };
        return {
          resources: cairn.stones.map((stone) => ({
            uri: `cairn://stone/${stone.id}`,
            name: stone.id,
            title: stone.title,
            mimeType: JSON_MIME,
          })),
        };
      },
    }),
    {
      title: "A stone",
      description: "One stone by id (a full ULID, or a unique prefix), as JSON.",
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const raw = variables.id;
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (!id) throw new Error(`No stone id in ${uri.href}`);
      return jsonResource(uri, await stonePayload(target, decodeURIComponent(id)));
    },
  );

  return server;
}

/** Serve the cairn over stdio — the transport Claude Code speaks. */
export async function startStdioServer(options: CairnServerOptions = {}): Promise<McpServer> {
  const server = createCairnServer(options);
  await server.connect(new StdioServerTransport());
  return server;
}
