/**
 * The point of the MCP server: the acceptance guard-rail is enforced here, in
 * the server, not in a skill prompt. An agent cannot talk its way past it, and
 * there is no `force` over MCP.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLEAN_DRAFT,
  DIRTY_ACCEPTANCE,
  connect,
  makeCairn,
  seedDraft,
  type Session,
  type TempCairn,
} from "./helpers.js";

interface Refusal {
  ok: boolean;
  error: string;
  message: string;
  violations: { rule: string; criterion: string; match: string; index: number }[];
  formatted: string[];
}

describe("acceptance guard-rail", () => {
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

  it("refuses create_draft when the criteria leak implementation detail", async () => {
    const { isError, payload } = await session.call<Refusal>("create_draft", {
      ...CLEAN_DRAFT,
      acceptance: DIRTY_ACCEPTANCE,
    });

    expect(isError).toBe(true);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("acceptance-criteria-are-user-language");
    expect(payload.violations.map((violation) => violation.rule).sort()).toEqual([
      "css-selector",
      "http-route",
      "identifier",
    ]);
    expect(payload.formatted).toHaveLength(payload.violations.length);
    expect(payload.message).toMatch(/user language/i);

    // Nothing was written: a refused stone is not a stone.
    const listed = await session.call<{ count: number }>("list_stones", { includeRetired: true });
    expect(listed.payload.count).toBe(0);
  });

  it("names the offending fragment so an agent can rewrite it", async () => {
    const { payload } = await session.call<Refusal>("create_draft", {
      ...CLEAN_DRAFT,
      acceptance: ["the total appears in #cart-total after checkout()"],
    });

    const rules = payload.violations.map((violation) => violation.rule);
    expect(rules).toContain("css-selector");
    expect(rules).toContain("function-call");
    expect(payload.violations.map((violation) => violation.match)).toContain("#cart-total");
    expect(payload.violations.every((violation) => violation.index === 0)).toBe(true);
  });

  it("refuses amend_stone on dirty criteria and leaves the amended stone alone", async () => {
    const original = await seedDraft(session);

    const { isError, payload } = await session.call<Refusal>("amend_stone", {
      id: original.stone.id,
      acceptance: ["the shopper sees the total", "GET /cart/total answers in under a second"],
    });

    expect(isError).toBe(true);
    expect(payload.error).toBe("acceptance-criteria-are-user-language");
    expect(payload.violations[0]?.rule).toBe("http-route");

    // The old stone is untouched: still a draft, still the only stone.
    const onDisk = await project.stone(original.stone.id);
    expect(onDisk.stone.status).toBe("draft");
    expect(onDisk.stone.amendedBy).toBeNull();

    const listed = await session.call<{ count: number }>("list_stones", { includeRetired: true });
    expect(listed.payload.count).toBe(1);
  });

  it("judges the criteria the amendment will actually carry, inherited ones included", async () => {
    // A stone whose criteria are clean stays amendable without restating them.
    const original = await seedDraft(session);
    const amended = await session.call<{ stone: { acceptance: string[] } }>("amend_stone", {
      id: original.stone.id,
      title: "Le panier affiche aussi les frais de port",
    });

    expect(amended.isError).toBe(false);
    expect(amended.payload.stone.acceptance).toEqual(CLEAN_DRAFT.acceptance);
  });

  it("offers no way to force a refusal through", async () => {
    const tools = (await session.client.listTools()).tools;
    for (const tool of tools) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
      expect(Object.keys(properties)).not.toContain("force");
    }

    // An unknown `force` argument is stripped, not honoured.
    const { isError, payload } = await session.call<Refusal>("create_draft", {
      ...CLEAN_DRAFT,
      acceptance: DIRTY_ACCEPTANCE,
      force: true,
    });
    expect(isError).toBe(true);
    expect(payload.error).toBe("acceptance-criteria-are-user-language");

    const listed = await session.call<{ count: number }>("list_stones", { includeRetired: true });
    expect(listed.payload.count).toBe(0);
  });

  it("lets clean criteria through, in either language", async () => {
    const { isError, payload } = await session.call<{ ok: boolean; stone: { acceptance: string[] } }>(
      "create_draft",
      {
        title: "Le client peut payer",
        request: "je veux payer sans créer de compte",
        acceptance: [
          "the shopper can pay without creating an account",
          "le client voit un reçu après le paiement",
        ],
      },
    );

    expect(isError).toBe(false);
    expect(payload.ok).toBe(true);
    expect(payload.stone.acceptance).toHaveLength(2);
  });
});
