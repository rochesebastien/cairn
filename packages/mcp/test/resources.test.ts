import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, makeCairn, seedDraft, type Session, type TempCairn } from "./helpers.js";

describe("cairn:// resources", () => {
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

  it("advertises the cairn and the status resources, plus the stone template", async () => {
    const { resources } = await session.client.listResources();
    const uris = resources.map((resource) => resource.uri);
    expect(uris).toContain("cairn://stones");
    expect(uris).toContain("cairn://status");
    for (const resource of resources) expect(resource.mimeType).toBe("application/json");

    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate)).toContain("cairn://stone/{id}");
  });

  it("serves the whole cairn, retired stones included", async () => {
    const first = await seedDraft(session);
    const amended = await session.call<{ stone: { id: string } }>("amend_stone", {
      id: first.stone.id,
      title: "Le panier affiche le total et les frais",
    });

    const cairn = await session.read<{
      root: string;
      count: number;
      stones: { id: string; status: string; body: string; path: string }[];
    }>("cairn://stones");

    expect(cairn.root).toBe(project.root);
    expect(cairn.count).toBe(2);
    expect(cairn.stones.map((stone) => stone.status).sort()).toEqual(["draft", "retired"]);
    expect(cairn.stones.map((stone) => stone.id)).toContain(amended.payload.stone.id);
    expect(cairn.stones[0]?.path).toMatch(/^\.cairn\/stones\/.+\.md$/);
  });

  it("serves the status synthesis", async () => {
    const created = await seedDraft(session, { proof: true });
    await project.proof(created.stone.id);
    await session.call("record_run", { stoneId: created.stone.id, result: "green" });
    await seedDraft(session, { title: "Un autre caillou" });

    const status = await session.read<{
      total: number;
      active: number;
      coverage: number;
      counts: Record<string, number>;
      drafts: { id: string; title: string }[];
      broken: unknown[];
      escalated: unknown[];
    }>("cairn://status");

    expect(status.total).toBe(2);
    expect(status.active).toBe(2);
    expect(status.counts).toEqual({ draft: 1, proven: 1, broken: 0, escalated: 0, retired: 0 });
    expect(status.coverage).toBe(50);
    expect(status.drafts).toHaveLength(1);
    expect(status.broken).toEqual([]);
    expect(status.escalated).toEqual([]);
  });

  it("serves one stone by id, and lists the stones as resources", async () => {
    const created = await seedDraft(session, { intent: "Trust is the feature." });

    const single = await session.read<{ stone: { id: string; title: string; body: string } }>(
      `cairn://stone/${created.stone.id}`,
    );
    expect(single.stone.id).toBe(created.stone.id);
    expect(single.stone.body).toBe("Trust is the feature.");

    // The template lists what it can serve.
    const { resources } = await session.client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain(`cairn://stone/${created.stone.id}`);
  });

  it("fails loudly on a stone uri that resolves to nothing", async () => {
    await expect(session.read("cairn://stone/01JZZZZZZZZZZZZZZZZZZZZZZZ")).rejects.toThrow(
      /No stone with id/,
    );
  });
});
