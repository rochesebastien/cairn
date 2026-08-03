import { mkdir, readFile, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLEAN_DRAFT, connect, makeCairn, seedDraft, type Session, type TempCairn } from "./helpers.js";

/** The frozen tool names. Every skill and app in the monorepo speaks exactly these. */
const TOOL_NAMES = [
  "amend_stone",
  "create_draft",
  "get_escalations",
  "get_stone",
  "lint_acceptance",
  "list_stones",
  "record_run",
  "retire_stone",
];

describe("cairn mcp tools", () => {
  let project: TempCairn;
  let session: Session;

  beforeEach(async () => {
    project = await makeCairn();
    session = await connect(project.root);
  });

  afterEach(async () => {
    await session.close();
    await project.cleanup();
  });

  it("exposes exactly the frozen tool names", async () => {
    const { tools } = await session.client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(TOOL_NAMES);
    for (const tool of tools) {
      expect(tool.description, `${tool.name} needs a description`).toBeTruthy();
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("lists an empty cairn", async () => {
    const { isError, payload } = await session.call<{ count: number; stones: unknown[] }>("list_stones");
    expect(isError).toBe(false);
    expect(payload.count).toBe(0);
    expect(payload.stones).toEqual([]);
  });

  it("creates a draft, then finds it again by id, by prefix and in the list", async () => {
    const created = await seedDraft(session, { intent: "The cart must be trustworthy." });

    expect(created.ok).toBe(true);
    expect(created.stone.status).toBe("draft");
    expect(created.stone.acceptance).toEqual(CLEAN_DRAFT.acceptance);
    expect(created.path).toBe(`.cairn/stones/${created.stone.id}.md`);

    // The stone really is on disk, with its intent body.
    const onDisk = await project.stone(created.stone.id);
    expect(onDisk.stone.title).toBe(CLEAN_DRAFT.title);
    expect(onDisk.body).toBe("The cart must be trustworthy.");

    const byId = await session.call<{ stone: { id: string; body: string; path: string } }>("get_stone", {
      id: created.stone.id,
    });
    expect(byId.payload.stone.id).toBe(created.stone.id);
    expect(byId.payload.stone.body).toBe("The cart must be trustworthy.");
    expect(byId.payload.stone.path).toBe(created.path);

    const byPrefix = await session.call<{ stone: { id: string } }>("get_stone", {
      id: created.stone.id.slice(0, 14),
    });
    expect(byPrefix.payload.stone.id).toBe(created.stone.id);

    const listed = await session.call<{ count: number; stones: { id: string }[] }>("list_stones");
    expect(listed.payload.count).toBe(1);
    expect(listed.payload.stones[0]?.id).toBe(created.stone.id);
  });

  it("filters by status and by surface", async () => {
    const first = await seedDraft(session);
    await seedDraft(session, { surface: "cli", title: "La CLI répond en JSON" });

    const drafts = await session.call<{ count: number }>("list_stones", { status: "draft" });
    expect(drafts.payload.count).toBe(2);

    const proven = await session.call<{ count: number }>("list_stones", { status: "proven" });
    expect(proven.payload.count).toBe(0);

    const checkout = await session.call<{ count: number; stones: { id: string }[] }>("list_stones", {
      surface: "checkout",
    });
    expect(checkout.payload.count).toBe(1);
    expect(checkout.payload.stones[0]?.id).toBe(first.stone.id);
  });

  it("refuses an unknown status at the schema level", async () => {
    // Schema violations never reach an operation: the SDK rejects them for us,
    // with its own plain-text error rather than a Cairn payload.
    const result = await session.client.callTool({
      name: "list_stones",
      arguments: { status: "invented" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/status/i);
  });

  it("reports an unknown stone id as a structured error", async () => {
    const { isError, payload } = await session.call<{ ok: boolean; error: string; message: string }>(
      "get_stone",
      { id: "01JZZZZZZZZZZZZZZZZZZZZZZZ" },
    );
    expect(isError).toBe(true);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("refused");
    expect(payload.message).toMatch(/No stone with id/);
  });

  it("amends a stone: a new draft supersedes it and the old one is retired", async () => {
    const original = await seedDraft(session);

    const amended = await session.call<{
      ok: boolean;
      stone: { id: string; status: string; amends: string; acceptance: string[] };
      retired: { id: string; status: string; amendedBy: string };
    }>("amend_stone", {
      id: original.stone.id,
      title: "Le panier affiche le total et les frais de port",
    });

    expect(amended.isError).toBe(false);
    expect(amended.payload.stone.status).toBe("draft");
    expect(amended.payload.stone.amends).toBe(original.stone.id);
    // Acceptance criteria are inherited when the amendment does not restate them.
    expect(amended.payload.stone.acceptance).toEqual(CLEAN_DRAFT.acceptance);
    expect(amended.payload.retired.id).toBe(original.stone.id);
    expect(amended.payload.retired.status).toBe("retired");
    expect(amended.payload.retired.amendedBy).toBe(amended.payload.stone.id);

    // Retired stones stay out of the way unless asked for.
    const visible = await session.call<{ count: number; stones: { id: string }[] }>("list_stones");
    expect(visible.payload.stones.map((stone) => stone.id)).toEqual([amended.payload.stone.id]);

    const all = await session.call<{ count: number }>("list_stones", { includeRetired: true });
    expect(all.payload.count).toBe(2);
  });

  it("takes a proof path, and can carry it over to an amendment", async () => {
    const created = await seedDraft(session, { proof: "e2e/cart.spec.ts" });
    expect(created.stone.proof).toBe("e2e/cart.spec.ts");

    await mkdir(project.path("e2e"), { recursive: true });
    await writeFile(project.path("e2e", "cart.spec.ts"), "// the proof\n", "utf8");

    const amended = await session.call<{
      stone: { id: string; proof: string };
      carriedProof: string;
    }>("amend_stone", { id: created.stone.id, title: "Le panier, encore", carryProof: true });

    expect(amended.isError).toBe(false);
    const newId = amended.payload.stone.id;
    expect(amended.payload.stone.proof).toBe(`.cairn/proofs/${newId}.spec.ts`);
    expect(amended.payload.carriedProof).toBe(`.cairn/proofs/${newId}.spec.ts`);
    expect(await readFile(project.path(".cairn", "proofs", `${newId}.spec.ts`), "utf8")).toBe(
      "// the proof\n",
    );
  });

  it("refuses to amend a retired stone", async () => {
    const original = await seedDraft(session);
    await session.call("retire_stone", { id: original.stone.id });

    const { isError, payload } = await session.call<{ message: string }>("amend_stone", {
      id: original.stone.id,
      title: "trop tard",
    });
    expect(isError).toBe(true);
    expect(payload.message).toMatch(/already retired/i);
  });

  it("retires a stone, and says so when it is already retired", async () => {
    const created = await seedDraft(session);

    const retired = await session.call<{ ok: boolean; from: string; stone: { status: string } }>(
      "retire_stone",
      { id: created.stone.id },
    );
    expect(retired.isError).toBe(false);
    expect(retired.payload.from).toBe("draft");
    expect(retired.payload.stone.status).toBe("retired");
    expect((await project.stone(created.stone.id)).stone.status).toBe("retired");

    const again = await session.call<{ error: string }>("retire_stone", { id: created.stone.id });
    expect(again.isError).toBe(true);
    expect(again.payload.error).toBe("already-retired");
  });

  it("lints acceptance criteria without writing anything", async () => {
    const clean = await session.call<{ clean: boolean; violations: unknown[] }>("lint_acceptance", {
      criteria: ["the shopper sees the total including tax"],
    });
    expect(clean.isError).toBe(false);
    expect(clean.payload.clean).toBe(true);
    expect(clean.payload.violations).toEqual([]);

    const dirty = await session.call<{
      clean: boolean;
      count: number;
      violations: { rule: string; match: string; index: number }[];
      formatted: string[];
    }>("lint_acceptance", { criteria: ["the shopper sees the total", "the cartTotal is refreshed"] });

    expect(dirty.isError).toBe(false);
    expect(dirty.payload.clean).toBe(false);
    expect(dirty.payload.count).toBe(1);
    expect(dirty.payload.violations[0]?.rule).toBe("identifier");
    expect(dirty.payload.violations[0]?.match).toBe("cartTotal");
    expect(dirty.payload.violations[0]?.index).toBe(1);
    expect(dirty.payload.formatted[0]).toContain("identifier");

    const listed = await session.call<{ count: number }>("list_stones");
    expect(listed.payload.count).toBe(0);
  });

  it("reports the cairn is missing when the project has none", async () => {
    const bare = await makeCairnless();
    const bareSession = await connect(bare.root);
    try {
      const { isError, payload } = await bareSession.call<{ message: string; details: string[] }>(
        "list_stones",
      );
      expect(isError).toBe(true);
      expect(payload.message).toMatch(/No cairn found/);
      expect(payload.details.join(" ")).toMatch(/cairn init/);
    } finally {
      await bareSession.close();
      await bare.cleanup();
    }
  });
});

/** A temp directory with no `.cairn/` at all. */
async function makeCairnless(): Promise<{ root: string; cleanup(): Promise<void> }> {
  const { mkdtemp, realpath, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = (await import("node:path")).default;
  const base = await realpath(tmpdir()).catch(() => tmpdir());
  const root = await mkdtemp(path.join(base, "cairn-bare-"));
  return { root, cleanup: async () => rm(root, { recursive: true, force: true }) };
}
