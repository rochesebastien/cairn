import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Stone } from "@usecairn/core";
import { cli, makeProject, seedStone, withStub, type TempProject } from "./helpers.js";

interface VerifyJson {
  ok: boolean;
  ran: boolean;
  results: Array<{
    id: string;
    from: string;
    to: string;
    result: string;
    changed: boolean;
    reason?: string;
    integrity?: { ok: boolean; status: string };
  }>;
  integrity?: Array<{ id: string; ok: boolean; status: string }>;
  summary: { green: number; red: number; skipped: number; broken: number; integrityFailures: number };
  exitCode: number;
}

/**
 * `verify` against a stubbed runner: no browser, no network, but the real
 * spawn / JSON-report / transition path.
 */
describe("cairn verify", () => {
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

  /** A draft stone with a proof file on disk. */
  async function seedProvable(): Promise<string> {
    const id = await seedStone(project, ["--proof"]);
    await project.proof(id);
    return id;
  }

  it("turns a green proof into a proven stone and stamps lastGreen", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();

    expect(result.code).toBe(0);
    expect(payload.ok).toBe(true);
    expect(payload.ran).toBe(true);
    expect(payload.results[0]).toMatchObject({ id, from: "draft", to: "proven", result: "green" });

    const { stone } = await project.stone(id);
    expect(stone.status).toBe("proven");
    expect(stone.lastGreen).not.toBeNull();
    expect(Date.parse(stone.lastGreen?.at ?? "")).not.toBeNaN();

    // The recorded hash is the hash of the proof that was green.
    const proof = await readFile(project.path(".cairn", "proofs", `${id}.spec.ts`), "utf8");
    const { hashProof } = await import("@usecairn/core");
    expect(stone.lastGreen?.proofHash).toBe(hashProof(proof));
  });

  it("breaks a proven stone when its proof goes red, and exits non-zero", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    stub.restore();
    stub = withStub({ results: { "*": "failed" } });
    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();

    expect(result.code).toBe(1);
    expect(payload.results[0]).toMatchObject({ from: "proven", to: "broken", result: "red" });
    expect(payload.summary.broken).toBe(1);
    expect((await project.stone(id)).stone.status).toBe("broken");
  });

  it("brings a broken stone back to proven when the proof goes green again", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "failed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });
    // A draft that goes red stays a draft (the frozen state machine has no
    // draft -> broken edge), so break it from proven.
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });
    stub.restore();
    stub = withStub({ results: { "*": "failed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });
    expect((await project.stone(id)).stone.status).toBe("broken");

    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });

    expect(result.code).toBe(0);
    expect(result.json<VerifyJson>().results[0]).toMatchObject({ from: "broken", to: "proven" });
    expect((await project.stone(id)).stone.status).toBe("proven");
  });

  it("leaves a red draft as a draft but still fails the run", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "failed" } });

    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();

    expect(result.code).toBe(1);
    expect(payload.results[0]).toMatchObject({ from: "draft", to: "draft", changed: false });
    expect(payload.results[0]?.reason).toContain("not proven yet");
    expect((await project.stone(id)).stone.status).toBe("draft");
  });

  it("skips a draft with no proof, without failing", async () => {
    const id = await seedStone(project);
    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();

    expect(result.code).toBe(0);
    expect(payload.ran).toBe(false);
    expect(payload.results[0]).toMatchObject({ id, result: "missing", changed: false, to: "draft" });
    expect(payload.results[0]?.reason).toContain("no proof");
  });

  it("breaks a proven stone whose proof file vanished", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    const { rm } = await import("node:fs/promises");
    await rm(project.path(".cairn", "proofs", `${id}.spec.ts`));

    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    expect(result.code).toBe(1);
    expect(result.json<VerifyJson>().results[0]).toMatchObject({ to: "broken", result: "missing" });
  });

  it("never moves an escalated stone", async () => {
    const id = await seedProvable();
    await cli(["escalate", id], { cwd: project.root });
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const result = await cli(["verify", id, ...stub.args, "--json"], { cwd: project.root });
    expect(result.json<VerifyJson>().results[0]).toMatchObject({
      to: "escalated",
      changed: false,
    });
    expect((await project.stone(id)).stone.status).toBe("escalated");
  });

  it("never runs a retired stone", async () => {
    const id = await seedProvable();
    await cli(["amend", id, "--json"], { cwd: project.root, stdin: "{}" });

    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();
    expect(payload.results.some((row) => row.id === id)).toBe(false);
  });

  it("restricts the run to proven stones with --proven-only", async () => {
    const proven = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", proven, ...stub.args], { cwd: project.root });

    const draft = await seedStone(project, ["--proof"]);
    await project.proof(draft);

    const result = await cli(["verify", "--proven-only", ...stub.args, "--json"], {
      cwd: project.root,
    });
    const payload = result.json<VerifyJson>();

    expect(payload.results).toHaveLength(1);
    expect(payload.results[0]?.id).toBe(proven);
    expect((await project.stone(draft)).stone.status).toBe("draft");
  });

  it("verifies only the ids it is given", async () => {
    const first = await seedProvable();
    const second = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const result = await cli(["verify", second, ...stub.args, "--json"], { cwd: project.root });
    const payload = result.json<VerifyJson>();

    expect(payload.results.map((row) => row.id)).toEqual([second]);
    expect((await project.stone(first)).stone.status).toBe("draft");
    expect((await project.stone(second)).stone.status).toBe("proven");
  });

  it("reports tampering with --integrity and exits non-zero", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    // The proof is rewritten after the stone was declared proven.
    await project.proof(id, "// a different proof entirely\n");

    const audit = await cli(["verify", "--integrity", "--no-run", "--json"], { cwd: project.root });
    const payload = audit.json<VerifyJson>();

    expect(audit.code).toBe(1);
    expect(payload.ran).toBe(false);
    expect(payload.integrity?.[0]).toMatchObject({ id, ok: false, status: "mismatch" });
    expect(payload.summary.integrityFailures).toBe(1);

    // Still proven: integrity reports, it does not transition.
    expect((await project.stone(id)).stone.status).toBe("proven");
  });

  it("passes an untampered proof through the integrity audit", async () => {
    await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    const audit = await cli(["verify", "--integrity", "--no-run", "--json"], { cwd: project.root });
    expect(audit.code).toBe(0);
    expect(audit.json<VerifyJson>().integrity?.[0]?.status).toBe("match");
  });

  it("changes nothing with --dry-run", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const result = await cli(["verify", "--dry-run", ...stub.args, "--json"], { cwd: project.root });
    expect(result.code).toBe(0);
    expect(result.json<VerifyJson>().results[0]?.to).toBe("proven");
    expect((await project.stone(id)).stone.status).toBe("draft");
  });

  it("runs the setup hook before the proofs, and fails loudly when it fails", async () => {
    const id = await seedProvable();
    await project.write(
      "setup.mjs",
      `import { writeFileSync } from "node:fs";\nwriteFileSync("setup-ran.txt", "ok");\n`,
    );
    await project.write(
      "cairn.config.ts",
      `export default {
         baseURL: "http://localhost:3000",
         setup: "node setup.mjs",
         retries: 0,
       };`,
    );

    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    const ok = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    expect(ok.code).toBe(0);
    await expect(project.read("setup-ran.txt")).resolves.toBe("ok");
    expect((await project.stone(id)).stone.status).toBe("proven");

    await project.write(
      "cairn.config.ts",
      `export default { baseURL: "http://localhost:3000", setup: "node -e process.exit(3)" };`,
    );
    const failed = await cli(["verify", ...stub.args], { cwd: project.root });
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("setup hook failed");
  });

  it("honours the retries configured in cairn.config.ts", async () => {
    const id = await seedProvable();
    const log = project.path("runner-argv.log");
    await project.write(
      "cairn.config.ts",
      `export default { baseURL: "http://localhost:3000", retries: 2 };`,
    );

    stub.restore();
    stub = withStub({ results: { "*": "passed" }, log });

    await cli(["verify", ...stub.args], { cwd: project.root });
    const argv = JSON.parse((await project.read("runner-argv.log")).trim()) as string[];

    expect(argv).toContain("--reporter=json");
    expect(argv).toContain("--retries=2");
    expect(argv).toContain(`.cairn/proofs/${id}.spec.ts`);
  });

  it("hands the config's baseURL and start command to the runner", async () => {
    await seedProvable();
    const log = project.path("runner-env.log");
    await project.write(
      "cairn.config.ts",
      `export default {
         baseURL: "http://localhost:4321",
         start: "npm run dev",
       };`,
    );
    await project.write(
      "env-runner.mjs",
      `import { writeFileSync } from "node:fs";
       writeFileSync(${JSON.stringify(log)}, JSON.stringify({
         base: process.env.CAIRN_BASE_URL,
         start: process.env.CAIRN_START,
         report: Boolean(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME),
       }));
       writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({ suites: [], errors: [] }));
      `,
    );

    await cli(["verify", "--runner", `node ${project.path("env-runner.mjs")}`], {
      cwd: project.root,
    });

    expect(JSON.parse(await project.read("runner-env.log"))).toEqual({
      base: "http://localhost:4321",
      start: "npm run dev",
      report: true,
    });
  });

  it("does not break every stone when the runner itself explodes", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ mode: "crash" });

    const result = await cli(["verify", ...stub.args], { cwd: project.root });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("failed before any proof ran");
    expect((await project.stone(id)).stone.status).toBe("draft");
  });

  it("fails clearly when no runner can be started", async () => {
    await seedProvable();
    const result = await cli(["verify", "--runner", "cairn-no-such-runner-xyz"], {
      cwd: project.root,
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No Playwright runner");
  });

  it("fails when the runner reports no result for a proof", async () => {
    await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "absent" } });

    const result = await cli(["verify", ...stub.args, "--json"], { cwd: project.root });
    expect(result.code).toBe(1);
    expect(result.json<VerifyJson>().results[0]).toMatchObject({ result: "no-result" });
  });

  it("takes the runner from CAIRN_PLAYWRIGHT_CMD when no --runner is given", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const previous = process.env.CAIRN_PLAYWRIGHT_CMD;
    process.env.CAIRN_PLAYWRIGHT_CMD = stub.args[1] as string;
    try {
      const result = await cli(["verify", "--json"], { cwd: project.root });
      expect(result.code).toBe(0);
      expect((await project.stone(id)).stone.status).toBe("proven");
    } finally {
      if (previous === undefined) delete process.env.CAIRN_PLAYWRIGHT_CMD;
      else process.env.CAIRN_PLAYWRIGHT_CMD = previous;
    }
  });

  it("prints a human summary when not asked for JSON", async () => {
    await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });

    const result = await cli(["verify", ...stub.args], { cwd: project.root });
    expect(result.stdout).toContain("draft");
    expect(result.stdout).toContain("proven");
    expect(result.stdout).toContain("1 green");
  });

  it("says there is nothing to verify on an empty cairn", async () => {
    const result = await cli(["verify", ...stub.args], { cwd: project.root });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing to verify");
  });

  it("rejects an unknown id", async () => {
    const result = await cli(["verify", "01ARZ3NDEKTSV4RRFFQ69G5FAV", ...stub.args], {
      cwd: project.root,
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("No stone with id");
  });

  it("keeps the stone body intact across a verify run", async () => {
    const id = await seedProvable();
    const body = "# Intent\n\nThe shopper must never be surprised by the total.";
    const { stone } = await project.stone(id);
    const { serializeStone } = await import("@usecairn/core");
    await project.write(`.cairn/stones/${id}.md`, serializeStone(stone, body));

    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    const after = await project.stone(id);
    expect(after.body).toBe(body);
    expect(after.stone.status).toBe("proven");
  });

  it("exposes the same stone shape as `show` after a run", async () => {
    const id = await seedProvable();
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    const show = await cli(["show", id, "--json"], { cwd: project.root });
    const stone = show.json<{ stone: Stone; integrity: { status: string } }>();
    expect(stone.stone.status).toBe("proven");
    expect(stone.integrity.status).toBe("match");
  });
});
