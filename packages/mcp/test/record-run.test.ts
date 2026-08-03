/**
 * `record_run` is the only tool that moves a stone's status, and it must move
 * it exactly the way `cairn verify` does — the state machine lives in
 * @cairn/core and nowhere else.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { escalate, hashProof, serializeStone } from "@cairn/core";
import { connect, makeCairn, seedDraft, type Session, type TempCairn } from "./helpers.js";

interface RunPayload {
  ok: boolean;
  stoneId: string;
  result: string;
  from: string;
  to: string;
  changed: boolean;
  reason?: string;
  transition?: { from: string; to: string };
  stone: { status: string; lastGreen: { at: string; commit?: string; proofHash?: string } | null };
}

const PROOF = "import { test } from '@playwright/test';\ntest('total', async () => {});\n";

describe("record_run", () => {
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

  /** A draft with a proof file on disk, ready to be run. */
  async function seedWithProof(): Promise<string> {
    const created = await seedDraft(session, { proof: true });
    expect(created.stone.proof).toBe(`.cairn/proofs/${created.stone.id}.spec.ts`);
    await project.proof(created.stone.id, PROOF);
    return created.stone.id;
  }

  it("proves a draft on green and stamps lastGreen with the proof hash", async () => {
    const id = await seedWithProof();

    const { isError, payload } = await session.call<RunPayload>("record_run", {
      stoneId: id,
      result: "green",
    });

    expect(isError).toBe(false);
    expect(payload.from).toBe("draft");
    expect(payload.to).toBe("proven");
    expect(payload.changed).toBe(true);
    expect(payload.transition).toEqual({ from: "draft", to: "proven" });
    expect(payload.stone.lastGreen?.proofHash).toBe(hashProof(PROOF));
    expect(Number.isNaN(Date.parse(payload.stone.lastGreen?.at ?? ""))).toBe(false);

    // And it is persisted, not only reported.
    const onDisk = await project.stone(id);
    expect(onDisk.stone.status).toBe("proven");
    expect(onDisk.stone.lastGreen?.proofHash).toBe(hashProof(PROOF));
  });

  it("takes the run metadata it is given, verbatim", async () => {
    const id = await seedWithProof();

    const { payload } = await session.call<RunPayload>("record_run", {
      stoneId: id,
      result: "green",
      runMeta: {
        at: "2026-08-03T10:11:12.000Z",
        commit: "0123456789abcdef0123456789abcdef01234567",
        proofHash: "deadbeef",
      },
    });

    expect(payload.stone.lastGreen).toEqual({
      at: "2026-08-03T10:11:12.000Z",
      commit: "0123456789abcdef0123456789abcdef01234567",
      proofHash: "deadbeef",
    });
  });

  it("leaves a red draft a draft — draft never becomes broken", async () => {
    const id = await seedWithProof();

    const { isError, payload } = await session.call<RunPayload>("record_run", {
      stoneId: id,
      result: "red",
    });

    expect(isError).toBe(false);
    expect(payload.from).toBe("draft");
    expect(payload.to).toBe("draft");
    expect(payload.changed).toBe(false);
    expect(payload.transition).toBeUndefined();
    expect(payload.reason).toBe("draft is not proven yet");
    expect((await project.stone(id)).stone.status).toBe("draft");
  });

  it("breaks a proven stone on red, and proves it again on green", async () => {
    const id = await seedWithProof();
    await session.call("record_run", { stoneId: id, result: "green" });

    const red = await session.call<RunPayload>("record_run", { stoneId: id, result: "red" });
    expect(red.payload.transition).toEqual({ from: "proven", to: "broken" });
    expect((await project.stone(id)).stone.status).toBe("broken");

    // A second red changes nothing: it is already broken.
    const again = await session.call<RunPayload>("record_run", { stoneId: id, result: "red" });
    expect(again.payload.changed).toBe(false);
    expect(again.payload.reason).toBe("already broken");

    const repaired = await session.call<RunPayload>("record_run", { stoneId: id, result: "green" });
    expect(repaired.payload.transition).toEqual({ from: "broken", to: "proven" });
    expect((await project.stone(id)).stone.status).toBe("proven");
  });

  it("breaks a proven stone whose proof went missing", async () => {
    const id = await seedWithProof();
    await session.call("record_run", { stoneId: id, result: "green" });

    const { payload } = await session.call<RunPayload>("record_run", { stoneId: id, result: "missing" });
    expect(payload.to).toBe("broken");
    expect(payload.reason).toBe("proof file is missing");
  });

  it("does nothing to a draft that has no proof yet", async () => {
    const created = await seedDraft(session);

    const { payload } = await session.call<RunPayload>("record_run", {
      stoneId: created.stone.id,
      result: "missing",
    });
    expect(payload.changed).toBe(false);
    expect(payload.to).toBe("draft");
    expect(payload.reason).toBe("no proof to run");
  });

  it("never moves an escalated stone: only a human does", async () => {
    const id = await seedWithProof();
    const file = await project.stone(id);
    await project.writeStoneFile(id, serializeStone(escalate(file.stone), file.body));

    const escalations = await session.call<{ count: number; stones: { id: string }[] }>(
      "get_escalations",
    );
    expect(escalations.payload.count).toBe(1);
    expect(escalations.payload.stones[0]?.id).toBe(id);

    const { payload } = await session.call<RunPayload>("record_run", { stoneId: id, result: "green" });
    expect(payload.changed).toBe(false);
    expect(payload.to).toBe("escalated");
    expect(payload.reason).toMatch(/awaits a human/);
    expect((await project.stone(id)).stone.status).toBe("escalated");
  });

  it("never moves a retired stone", async () => {
    const id = await seedWithProof();
    await session.call("retire_stone", { id });

    const { payload } = await session.call<RunPayload>("record_run", { stoneId: id, result: "green" });
    expect(payload.changed).toBe(false);
    expect(payload.to).toBe("retired");
    expect(payload.reason).toBe("stone is retired");
  });

  it("reports an unknown stone id instead of inventing one", async () => {
    const { isError, payload } = await session.call<{ message: string }>("record_run", {
      stoneId: "01JZZZZZZZZZZZZZZZZZZZZZZZ",
      result: "green",
    });
    expect(isError).toBe(true);
    expect(payload.message).toMatch(/No stone with id/);
  });

  it("has nothing to report when no stone is escalated", async () => {
    await seedDraft(session);
    const { isError, payload } = await session.call<{ count: number; stones: unknown[] }>(
      "get_escalations",
    );
    expect(isError).toBe(false);
    expect(payload.count).toBe(0);
    expect(payload.stones).toEqual([]);
  });
});
