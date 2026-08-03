import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROOFS_DIR,
  DEFAULT_STONES_DIR,
  cairnConfigSchema,
  formatIssues,
  safeParseStone,
  stoneSchema,
} from "../src/schema.js";
import { newUlid } from "../src/ulid.js";
import { ID_A, makeStone } from "./helpers.js";

describe("stoneSchema", () => {
  it("applies defaults for the optional-with-default fields", () => {
    const stone = stoneSchema.parse({
      id: ID_A,
      title: "Un titre",
      status: "draft",
      createdAt: "2026-08-03T10:00:00.000Z",
      provenance: { request: "fais ceci" },
    });

    expect(stone.amends).toBeNull();
    expect(stone.amendedBy).toBeNull();
    expect(stone.acceptance).toEqual([]);
    expect(stone.lastGreen).toBeNull();
    expect(stone.proof).toBeNull();
    expect(stone.surface).toBeUndefined();
  });

  it("accepts every documented status", () => {
    for (const status of ["draft", "proven", "broken", "escalated", "retired"] as const) {
      expect(makeStone({ status }).status).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(safeParseStone({ ...makeStone(), status: "green" }).success).toBe(false);
  });

  it("rejects a non-ULID id", () => {
    const result = safeParseStone({ ...makeStone(), id: "not-a-ulid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatIssues(result.error)[0]).toContain("id:");
    }
  });

  it("rejects an empty title and a non-ISO createdAt", () => {
    expect(safeParseStone({ ...makeStone(), title: "" }).success).toBe(false);
    expect(safeParseStone({ ...makeStone(), createdAt: "hier" }).success).toBe(false);
  });

  it("requires a verbatim request in provenance", () => {
    expect(safeParseStone({ ...makeStone(), provenance: {} }).success).toBe(false);
    const stone = makeStone({
      provenance: { request: "je veux X", attempts: 2, tokens: 1234 },
    });
    expect(stone.provenance).toEqual({ request: "je veux X", attempts: 2, tokens: 1234 });
  });

  it("accepts a freshly generated ULID", () => {
    expect(safeParseStone({ ...makeStone(), id: newUlid() }).success).toBe(true);
  });

  it("accepts lastGreen with and without commit/proofHash", () => {
    expect(
      makeStone({ lastGreen: { at: "2026-08-03T11:00:00.000Z" } }).lastGreen,
    ).toEqual({ at: "2026-08-03T11:00:00.000Z" });
    expect(
      safeParseStone({
        ...makeStone(),
        lastGreen: { at: "pas une date" },
      }).success,
    ).toBe(false);
  });
});

describe("cairnConfigSchema", () => {
  it("defaults proofsDir, stonesDir and retries", () => {
    const config = cairnConfigSchema.parse({ baseURL: "http://localhost:3000" });
    expect(config).toEqual({
      baseURL: "http://localhost:3000",
      proofsDir: DEFAULT_PROOFS_DIR,
      stonesDir: DEFAULT_STONES_DIR,
      retries: 0,
    });
    expect(config.proofsDir).toBe(".cairn/proofs");
    expect(config.stonesDir).toBe(".cairn/stones");
  });

  it("keeps start and setup when provided", () => {
    const config = cairnConfigSchema.parse({
      baseURL: "http://localhost:5173",
      start: "pnpm dev",
      setup: "pnpm db:seed",
      retries: 2,
    });
    expect(config.start).toBe("pnpm dev");
    expect(config.setup).toBe("pnpm db:seed");
    expect(config.retries).toBe(2);
  });

  it("requires baseURL and rejects negative retries", () => {
    expect(cairnConfigSchema.safeParse({}).success).toBe(false);
    expect(
      cairnConfigSchema.safeParse({ baseURL: "http://x", retries: -1 }).success,
    ).toBe(false);
  });
});
