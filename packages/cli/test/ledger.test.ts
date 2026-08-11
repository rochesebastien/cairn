import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashProof, type RunAttemptEvent, type RunEvent } from "@usecairn/core";
import { cli, makeProject, seedStone, withStub, type TempProject } from "./helpers.js";

/**
 * The measurement ledger: `.cairn/runs/<ulid>.jsonl`, one line per proof
 * attempt. It is written by `verify` and folded by `escalate` / `amend`, and
 * it is never allowed to fail the command that produced it.
 */
describe("the run ledger", () => {
  let project: TempProject;
  let stub: ReturnType<typeof withStub>;

  beforeEach(async () => {
    project = await makeProject();
    await cli(["init"], { cwd: project.root });
    stub = withStub();
  });

  afterEach(async () => {
    stub.restore();
    await project.cleanup();
  });

  async function seedProvable(): Promise<string> {
    const id = await seedStone(project, ["--proof"]);
    await project.proof(id);
    return id;
  }

  /** Run the stubbed proofs once with a given outcome. */
  async function verify(outcome: "passed" | "failed"): Promise<void> {
    stub.restore();
    stub = withStub({ results: { "*": outcome } });
    await cli(["verify", ...stub.args], { cwd: project.root });
  }

  const runs = (events: RunEvent[]): RunAttemptEvent[] =>
    events.filter((event): event is RunAttemptEvent => event.kind === "run");

  describe("cairn verify", () => {
    it("appends one line per proof that ran, numbering the attempts", async () => {
      const id = await seedProvable();

      await verify("failed");
      await verify("failed");
      await verify("passed");

      const events = runs(await project.ledger(id));
      expect(events.map((event) => event.attempt)).toEqual([1, 2, 3]);
      expect(events.map((event) => event.result)).toEqual(["red", "red", "green"]);
      expect(events.every((event) => event.source === "verify")).toBe(true);
      expect(events.every((event) => !Number.isNaN(Date.parse(event.at)))).toBe(true);
    });

    it("records the hash of the proof that ran, red runs included", async () => {
      const id = await seedProvable();
      const proof = "// the proof as it was run\n";
      await project.proof(id, proof);

      await verify("failed");

      const [first] = runs(await project.ledger(id));
      expect(first?.result).toBe("red");
      expect(first?.proofHash).toBe(hashProof(proof));
      // Nothing to compare a first attempt against: it claims nothing.
      expect(first?.proofEdited).toBeUndefined();
    });

    it("flips proofEdited when the proof changed between two attempts", async () => {
      const id = await seedProvable();

      await verify("failed");
      await verify("failed");
      await project.proof(id, "// rewritten by the warden\n");
      await verify("passed");

      const events = runs(await project.ledger(id));
      expect(events.map((event) => event.proofEdited)).toEqual([undefined, false, true]);
    });

    it("writes nothing at all on --dry-run", async () => {
      const id = await seedProvable();
      stub.restore();
      stub = withStub({ results: { "*": "passed" } });

      await cli(["verify", ...stub.args, "--dry-run"], { cwd: project.root });

      expect(await project.ledger(id)).toEqual([]);
      expect((await project.stone(id)).stone.status).toBe("draft");
    });

    it("writes nothing when nothing ran (--no-run)", async () => {
      const id = await seedProvable();
      await cli(["verify", "--no-run", "--integrity"], { cwd: project.root });
      expect(await project.ledger(id)).toEqual([]);
    });

    it("records nothing for a stone whose proof is missing", async () => {
      const id = await seedStone(project, ["--proof"]);
      stub.restore();
      stub = withStub({ results: { "*": "passed" } });

      await cli(["verify", ...stub.args], { cwd: project.root });

      expect(await project.ledger(id)).toEqual([]);
    });
  });

  describe("cairn escalate", () => {
    it("takes its attempt count from the ledger when none is given", async () => {
      const id = await seedProvable();
      await verify("failed");
      await verify("failed");

      const result = await cli(["escalate", id, "--json"], { cwd: project.root });
      const payload = result.json<{
        attempts: number;
        attemptsFromLedger: boolean;
        stone: { provenance: { attempts?: number } };
      }>();

      expect(result.code).toBe(0);
      expect(payload.attempts).toBe(2);
      expect(payload.attemptsFromLedger).toBe(true);
      expect(payload.stone.provenance.attempts).toBe(2);
      expect((await project.stone(id)).stone.provenance.attempts).toBe(2);
    });

    it("lets --attempts override what the ledger counted", async () => {
      const id = await seedProvable();
      await verify("failed");

      const payload = (
        await cli(["escalate", id, "--attempts", "7", "--tokens", "4200", "--json"], {
          cwd: project.root,
        })
      ).json<{ attempts: number; attemptsFromLedger: boolean }>();

      expect(payload.attempts).toBe(7);
      expect(payload.attemptsFromLedger).toBe(false);
      expect((await project.stone(id)).stone.provenance.tokens).toBe(4200);
    });

    it("stamps nothing when there is nothing to count", async () => {
      const id = await seedStone(project);
      const payload = (await cli(["escalate", id, "--json"], { cwd: project.root })).json<{
        attempts: number | null;
      }>();

      expect(payload.attempts).toBeNull();
      expect((await project.stone(id)).stone.provenance.attempts).toBeUndefined();
    });

    it("appends an escalate line to the ledger", async () => {
      const id = await seedProvable();
      await verify("failed");
      await cli(["escalate", id], { cwd: project.root });

      const events = await project.ledger(id);
      expect(events.at(-1)).toMatchObject({ kind: "escalate", attempts: 1 });
    });
  });

  describe("cairn amend", () => {
    it("keeps what the ledger counted in the retired stone's provenance", async () => {
      const id = await seedProvable();
      await verify("failed");
      await verify("failed");

      const payload = (
        await cli(["amend", id, "--title", "Le panier affiche le total TTC", "--json"], {
          cwd: project.root,
          stdin: "{}",
        })
      ).json<{ stone: { id: string }; retired: { provenance: { attempts?: number } } }>();

      expect(payload.retired.provenance.attempts).toBe(2);
      expect((await project.stone(id)).stone.provenance.attempts).toBe(2);

      const events = await project.ledger(id);
      expect(events.at(-1)).toMatchObject({ kind: "amend", amendedBy: payload.stone.id });
    });

    it("never overwrites a provenance a human already wrote", async () => {
      const id = await seedProvable();
      await verify("failed");
      await cli(["escalate", id, "--attempts", "3"], { cwd: project.root });

      await cli(["amend", id, "--title", "Autre chose", "--json"], {
        cwd: project.root,
        stdin: "{}",
      });

      expect((await project.stone(id)).stone.provenance.attempts).toBe(3);
    });

    it("leaves no ledger behind for a stone that was never run", async () => {
      const id = await seedStone(project);
      await cli(["amend", id, "--title", "Autre chose", "--json"], {
        cwd: project.root,
        stdin: "{}",
      });

      expect(await project.ledger(id)).toEqual([]);
    });
  });
});
