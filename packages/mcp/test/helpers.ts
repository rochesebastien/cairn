import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseStoneFile, type ParsedStoneFile } from "@cairn/core";
import { createCairnServer } from "../src/server.js";

/* ------------------------------------------------------------- a project */

export interface TempCairn {
  root: string;
  cleanup(): Promise<void>;
  path(...segments: string[]): string;
  /** Read a stone file straight off disk, bypassing the server. */
  stone(id: string): Promise<ParsedStoneFile>;
  /** Write a proof file and return its POSIX path relative to the root. */
  proof(id: string, content?: string): Promise<string>;
  /** Overwrite a stone file, to set up states no tool can reach. */
  writeStoneFile(id: string, content: string): Promise<void>;
}

/** A temp project with an initialised (empty) cairn. */
export async function makeCairn(): Promise<TempCairn> {
  // realpath: macOS temp dirs are symlinks and the project loader resolves paths.
  const base = await realpath(tmpdir()).catch(() => tmpdir());
  const root = await mkdtemp(path.join(base, "cairn-mcp-"));
  await mkdir(path.join(root, ".cairn", "stones"), { recursive: true });
  await mkdir(path.join(root, ".cairn", "proofs"), { recursive: true });

  const project: TempCairn = {
    root,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
    path(...segments) {
      return path.join(root, ...segments);
    },
    async stone(id) {
      return parseStoneFile(await readFile(project.path(".cairn", "stones", `${id}.md`), "utf8"));
    },
    async proof(id, content = "// proof\n") {
      const relative = `.cairn/proofs/${id}.spec.ts`;
      await writeFile(project.path(...relative.split("/")), content, "utf8");
      return relative;
    },
    async writeStoneFile(id, content) {
      await writeFile(project.path(".cairn", "stones", `${id}.md`), content, "utf8");
    },
  };

  return project;
}

/* -------------------------------------------------------------- a client */

export interface ToolCall<T = Record<string, unknown>> {
  isError: boolean;
  payload: T;
}

export interface Session {
  client: Client;
  /** Call a tool and parse its JSON payload. */
  call<T = Record<string, unknown>>(name: string, args?: Record<string, unknown>): Promise<ToolCall<T>>;
  /** Read a resource and parse its JSON body. */
  read<T = Record<string, unknown>>(uri: string): Promise<T>;
  close(): Promise<void>;
}

/** An MCP client wired to a Cairn server over the SDK's in-memory transport. */
export async function connect(dir: string): Promise<Session> {
  const server = createCairnServer({ dir });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cairn-mcp-test", version: "0.0.0" });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    async call<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name, arguments: args });
      const content = result.content as { type: string; text?: string }[] | undefined;
      const text = content?.[0]?.text;
      if (typeof text !== "string") {
        throw new Error(`Tool ${name} returned no text content: ${JSON.stringify(result)}`);
      }
      const payload = JSON.parse(text) as T;
      // Every tool must also answer structurally, not only in prose.
      if (JSON.stringify(result.structuredContent) !== JSON.stringify(payload)) {
        throw new Error(`Tool ${name} structuredContent does not match its text payload`);
      }
      return { isError: result.isError === true, payload };
    },
    async read<T = Record<string, unknown>>(uri: string) {
      const result = await client.readResource({ uri });
      const first = result.contents[0] as { text?: string } | undefined;
      if (typeof first?.text !== "string") {
        throw new Error(`Resource ${uri} returned no text: ${JSON.stringify(result)}`);
      }
      return JSON.parse(first.text) as T;
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

/* --------------------------------------------------------------- fixtures */

export interface DraftPayload {
  ok: boolean;
  stone: { id: string; title: string; status: string; proof: string | null; acceptance: string[] };
  path: string;
}

/** A clean stone: user language only, so the guard-rail lets it through. */
export const CLEAN_DRAFT = {
  title: "Le panier affiche le total",
  request: "je veux voir le total dans le panier",
  acceptance: ["the shopper sees the total including tax"],
  surface: "checkout",
};

/** Criteria that leak implementation detail, one per lint rule. */
export const DIRTY_ACCEPTANCE = [
  "the total appears in .cart-total",
  "POST /api/cart returns the new total",
  "the cartTotal is refreshed",
];

export async function seedDraft(
  session: Session,
  overrides: Record<string, unknown> = {},
): Promise<DraftPayload> {
  const result = await session.call<DraftPayload>("create_draft", { ...CLEAN_DRAFT, ...overrides });
  if (result.isError) throw new Error(`seed failed: ${JSON.stringify(result.payload)}`);
  return result.payload;
}
