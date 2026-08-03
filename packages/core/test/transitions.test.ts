import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  amendChain,
  applyVerifyResult,
  canTransition,
  createAmendment,
  currentStone,
  escalate,
  isActive,
  isTerminal,
  legalTransitions,
  transition,
} from "../src/transitions.js";
import { STONE_STATUSES, type StoneStatus } from "../src/schema.js";
import { isUlid } from "../src/ulid.js";
import { ID_A, ID_B, ID_C, makeStone } from "./helpers.js";

const LEGAL: ReadonlyArray<[StoneStatus, StoneStatus]> = [
  ["draft", "proven"],
  ["draft", "escalated"],
  ["draft", "retired"],
  ["proven", "broken"],
  ["proven", "retired"],
  ["broken", "proven"],
  ["broken", "escalated"],
  ["broken", "retired"],
  ["escalated", "retired"],
];

function isLegal(from: StoneStatus, to: StoneStatus): boolean {
  return LEGAL.some(([f, t]) => f === from && t === to);
}

describe("canTransition", () => {
  it("allows exactly the frozen transitions and nothing else", () => {
    for (const from of STONE_STATUSES) {
      for (const to of STONE_STATUSES) {
        expect(
          canTransition(from, to),
          `${from} -> ${to} should be ${isLegal(from, to) ? "legal" : "illegal"}`,
        ).toBe(isLegal(from, to));
      }
    }
  });

  it("treats retired as terminal", () => {
    for (const to of STONE_STATUSES) {
      expect(canTransition("retired", to)).toBe(false);
    }
    expect(legalTransitions("retired")).toEqual([]);
    expect(isTerminal("retired")).toBe(true);
    expect(isActive("retired")).toBe(false);
  });

  it("never treats a status as a transition to itself", () => {
    for (const status of STONE_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("keeps every non-retired status active", () => {
    for (const status of ["draft", "proven", "broken", "escalated"] as const) {
      expect(isActive(status)).toBe(true);
      expect(isTerminal(status)).toBe(false);
      expect(legalTransitions(status)).toContain("retired");
    }
  });
});

describe("transition()", () => {
  it("returns a new stone on a legal move", () => {
    const stone = makeStone({ status: "draft" });
    const next = transition(stone, "proven");
    expect(next.status).toBe("proven");
    expect(stone.status).toBe("draft");
  });

  it("throws IllegalTransitionError on an illegal move", () => {
    for (const from of STONE_STATUSES) {
      for (const to of STONE_STATUSES) {
        if (isLegal(from, to)) continue;
        expect(() => transition(makeStone({ status: from }), to)).toThrow(
          IllegalTransitionError,
        );
      }
    }
  });

  it("mentions terminality when leaving retired", () => {
    expect(() => transition(makeStone({ status: "retired" }), "draft")).toThrow(
      /retired is terminal/,
    );
  });
});

describe("applyVerifyResult — green", () => {
  const meta = { at: "2026-08-03T12:00:00.000Z", commit: "abc123", proofHash: "hash" };

  it("proves a draft and stamps lastGreen", () => {
    const out = applyVerifyResult(
      makeStone({ status: "draft", proof: ".cairn/proofs/a.spec.ts" }),
      "green",
      meta,
    );
    expect(out.stone.status).toBe("proven");
    expect(out.changed).toBe(true);
    expect(out.transition).toEqual({ from: "draft", to: "proven" });
    expect(out.stone.lastGreen).toEqual(meta);
  });

  it("repairs a broken stone", () => {
    const out = applyVerifyResult(makeStone({ status: "broken" }), "green", meta);
    expect(out.stone.status).toBe("proven");
    expect(out.transition).toEqual({ from: "broken", to: "proven" });
  });

  it("refreshes lastGreen on an already proven stone without a transition", () => {
    const stone = makeStone({
      status: "proven",
      lastGreen: { at: "2026-08-01T00:00:00.000Z" },
    });
    const out = applyVerifyResult(stone, "green", meta);
    expect(out.stone.status).toBe("proven");
    expect(out.transition).toBeUndefined();
    expect(out.changed).toBe(true);
    expect(out.stone.lastGreen?.at).toBe(meta.at);
  });

  it("defaults lastGreen.at to now and omits absent commit/hash", () => {
    const before = Date.now();
    const out = applyVerifyResult(makeStone({ status: "draft" }), "green");
    expect(Date.parse(out.stone.lastGreen!.at)).toBeGreaterThanOrEqual(before);
    expect(out.stone.lastGreen).not.toHaveProperty("commit");
    expect(out.stone.lastGreen).not.toHaveProperty("proofHash");
  });

  it("leaves escalated and retired stones alone", () => {
    for (const status of ["escalated", "retired"] as const) {
      const stone = makeStone({ status });
      const out = applyVerifyResult(stone, "green", meta);
      expect(out.stone).toBe(stone);
      expect(out.changed).toBe(false);
      expect(out.reason).toBeTruthy();
    }
  });
});

describe("applyVerifyResult — red", () => {
  it("breaks a proven stone and keeps its lastGreen history", () => {
    const lastGreen = { at: "2026-08-02T00:00:00.000Z", proofHash: "h" };
    const out = applyVerifyResult(makeStone({ status: "proven", lastGreen }), "red");
    expect(out.stone.status).toBe("broken");
    expect(out.transition).toEqual({ from: "proven", to: "broken" });
    expect(out.stone.lastGreen).toEqual(lastGreen);
  });

  it("leaves a draft with a red proof as a draft (it was never green)", () => {
    const stone = makeStone({ status: "draft", proof: ".cairn/proofs/a.spec.ts" });
    const out = applyVerifyResult(stone, "red");
    expect(out.stone).toBe(stone);
    expect(out.stone.status).toBe("draft");
    expect(out.changed).toBe(false);
    expect(out.transition).toBeUndefined();
    expect(out.reason).toBe("draft is not proven yet");
    // The way out of a draft that will not go green is escalation.
    expect(escalate(out.stone).status).toBe("escalated");
  });

  it("is a no-op for a draft without a proof", () => {
    const stone = makeStone({ status: "draft", proof: null });
    const out = applyVerifyResult(stone, "red");
    expect(out.stone).toBe(stone);
    expect(out.changed).toBe(false);
    expect(out.reason).toBe("draft has no proof yet");
  });

  it("is a no-op for an already broken stone", () => {
    const stone = makeStone({ status: "broken" });
    const out = applyVerifyResult(stone, "red");
    expect(out.stone).toBe(stone);
    expect(out.changed).toBe(false);
    expect(out.reason).toBe("already broken");
  });
});

describe("applyVerifyResult — missing proof", () => {
  it("is a no-op on a draft", () => {
    const stone = makeStone({ status: "draft" });
    const out = applyVerifyResult(stone, "missing");
    expect(out.stone).toBe(stone);
    expect(out.changed).toBe(false);
    expect(out.transition).toBeUndefined();
  });

  it("breaks a proven stone whose proof vanished", () => {
    const out = applyVerifyResult(makeStone({ status: "proven" }), "missing");
    expect(out.stone.status).toBe("broken");
    expect(out.reason).toContain("missing");
  });

  it("is a no-op on a broken stone", () => {
    const stone = makeStone({ status: "broken" });
    expect(applyVerifyResult(stone, "missing").stone).toBe(stone);
  });
});

describe("escalate", () => {
  it("escalates a draft and a broken stone, recording attempts", () => {
    const draft = escalate(makeStone({ status: "draft" }), { attempts: 5 });
    expect(draft.status).toBe("escalated");
    expect(draft.provenance.attempts).toBe(5);
    expect(draft.provenance.request).toBe("je veux pouvoir me connecter");

    expect(escalate(makeStone({ status: "broken" })).status).toBe("escalated");
  });

  it("refuses to escalate a proven or retired stone", () => {
    expect(() => escalate(makeStone({ status: "proven" }))).toThrow(IllegalTransitionError);
    expect(() => escalate(makeStone({ status: "retired" }))).toThrow(IllegalTransitionError);
  });
});

describe("createAmendment", () => {
  it("creates a new draft and retires the old stone", () => {
    const old = makeStone({
      id: ID_A,
      status: "proven",
      surface: "auth",
      proof: `.cairn/proofs/${ID_A}.spec.ts`,
      lastGreen: { at: "2026-08-02T00:00:00.000Z", proofHash: "h" },
    });

    const { newStone, retiredOld } = createAmendment(old, {
      id: ID_B,
      createdAt: "2026-08-03T15:00:00.000Z",
      acceptance: ["Le visiteur reste connecté 30 jours"],
      provenance: { request: "garde-moi connecté un mois" },
    });

    expect(newStone.id).toBe(ID_B);
    expect(newStone.status).toBe("draft");
    expect(newStone.amends).toBe(ID_A);
    expect(newStone.amendedBy).toBeNull();
    expect(newStone.lastGreen).toBeNull();
    expect(newStone.proof).toBeNull();
    expect(newStone.surface).toBe("auth");
    expect(newStone.acceptance).toEqual(["Le visiteur reste connecté 30 jours"]);
    expect(newStone.provenance.request).toBe("garde-moi connecté un mois");

    expect(retiredOld.id).toBe(ID_A);
    expect(retiredOld.status).toBe("retired");
    expect(retiredOld.amendedBy).toBe(ID_B);
    // The old stone keeps its history; only its proof leaves the active suite.
    expect(retiredOld.proof).toBe(`.cairn/proofs/${ID_A}.spec.ts`);
    expect(retiredOld.lastGreen).toEqual(old.lastGreen);

    // The inputs are untouched.
    expect(old.status).toBe("proven");
    expect(old.amendedBy).toBeNull();
  });

  it("inherits title, surface, acceptance and provenance when not patched", () => {
    const old = makeStone({ status: "broken", surface: "panier" });
    const { newStone } = createAmendment(old);
    expect(newStone.title).toBe(old.title);
    expect(newStone.surface).toBe("panier");
    expect(newStone.acceptance).toEqual(old.acceptance);
    expect(newStone.provenance).toEqual(old.provenance);
    expect(isUlid(newStone.id)).toBe(true);
    expect(newStone.id).not.toBe(old.id);
    expect(Date.parse(newStone.createdAt)).toBeGreaterThan(0);
  });

  it("amends stones in every active status", () => {
    for (const status of ["draft", "proven", "broken", "escalated"] as const) {
      const { newStone, retiredOld } = createAmendment(makeStone({ status }));
      expect(retiredOld.status).toBe("retired");
      expect(newStone.amends).toBe(retiredOld.id);
    }
  });

  it("refuses to amend a retired stone", () => {
    expect(() => createAmendment(makeStone({ status: "retired" }))).toThrow(
      IllegalTransitionError,
    );
  });

  it("validates the new stone against the schema", () => {
    expect(() => createAmendment(makeStone(), { title: "" })).toThrow();
  });
});

describe("amend lineage", () => {
  function buildChain() {
    const first = makeStone({ id: ID_A, status: "proven" });
    const amendment1 = createAmendment(first, { id: ID_B, title: "v2" });
    const amendment2 = createAmendment(amendment1.newStone, { id: ID_C, title: "v3" });
    return {
      stones: [amendment1.retiredOld, amendment2.retiredOld, amendment2.newStone],
    };
  }

  it("links amends/amendedBy in both directions", () => {
    const { stones } = buildChain();
    const [v1, v2, v3] = stones;

    expect(v1!.amends).toBeNull();
    expect(v1!.amendedBy).toBe(ID_B);
    expect(v2!.amends).toBe(ID_A);
    expect(v2!.amendedBy).toBe(ID_C);
    expect(v3!.amends).toBe(ID_B);
    expect(v3!.amendedBy).toBeNull();
    expect(v1!.status).toBe("retired");
    expect(v2!.status).toBe("retired");
    expect(v3!.status).toBe("draft");
  });

  it("walks the chain from any member, oldest first", () => {
    const { stones } = buildChain();
    const expected = [ID_A, ID_B, ID_C];
    for (const id of expected) {
      expect(amendChain(stones, id).map((s) => s.id)).toEqual(expected);
    }
    expect(amendChain(stones.slice().reverse(), ID_B).map((s) => s.id)).toEqual(expected);
  });

  it("returns the single active stone of a chain", () => {
    const { stones } = buildChain();
    expect(currentStone(stones, ID_A)?.id).toBe(ID_C);
    expect(stones.filter((s) => s.status !== "retired")).toHaveLength(1);
  });

  it("handles unknown ids and broken links", () => {
    const { stones } = buildChain();
    expect(amendChain(stones, "01J0000000000000000000000Z")).toEqual([]);
    // Drop the middle stone: the walk stops at the gap instead of looping.
    const partial = stones.filter((s) => s.id !== ID_B);
    expect(amendChain(partial, ID_C).map((s) => s.id)).toEqual([ID_C]);
    expect(amendChain(partial, ID_A).map((s) => s.id)).toEqual([ID_A]);
  });
});
