import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runArgv } from "../src/proc.js";
import { makeProject, STUB_RUNNER, type TempProject } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(here, "..", "dist", "bin.js");

/**
 * The in-process tests drive run(); this one drives the real `cairn` binary in
 * a child process, so the shebang, the ESM entry point and the exit codes are
 * exercised end to end. Skipped when the package has not been built.
 */
const built = await access(BIN).then(
  () => true,
  () => false,
);

describe.skipIf(!built)("the cairn binary", () => {
  let project: TempProject;

  beforeEach(async () => {
    project = await makeProject();
  });

  afterEach(async () => {
    await project.cleanup();
  });

  const cairn = (args: string[], env: NodeJS.ProcessEnv = {}) =>
    runArgv(process.execPath, [BIN, ...args], { cwd: project.root, env });

  it("walks init → add → verify → status from a real shell invocation", async () => {
    const init = await cairn(["init"]);
    expect(init.code).toBe(0);

    const add = await cairn([
      "add",
      "--title",
      "Le panier affiche le total",
      "--acceptance",
      "the shopper sees the total including tax",
      "--request",
      "je veux voir le total dans le panier",
      "--proof",
      "--json",
    ]);
    expect(add.code).toBe(0);
    const id = (JSON.parse(add.stdout) as { stone: { id: string } }).stone.id;
    await project.proof(id);

    const verify = await cairn(["verify", "--runner", STUB_RUNNER], {
      CAIRN_STUB_RESULTS: JSON.stringify({ "*": "passed" }),
    });
    expect(verify.code).toBe(0);
    expect(verify.stdout).toContain("1 green");

    const status = await cairn(["status", "--json"]);
    expect(JSON.parse(status.stdout)).toMatchObject({ counts: { proven: 1 } });
  });

  it("exits 2 when the acceptance lint refuses the stone", async () => {
    await cairn(["init"]);
    const add = await cairn([
      "add",
      "--title",
      "Bad",
      "--acceptance",
      "the #total element shows the price",
      "--request",
      "x",
    ]);

    expect(add.code).toBe(2);
    expect(add.stderr).toContain("user language");
    expect(add.stdout).toBe("");
  });

  it("exits 1 when a proof is red", async () => {
    await cairn(["init"]);
    const add = await cairn([
      "add",
      "--title",
      "Red",
      "--acceptance",
      "the shopper sees the total",
      "--request",
      "x",
      "--proof",
      "--json",
    ]);
    const id = (JSON.parse(add.stdout) as { stone: { id: string } }).stone.id;
    await project.proof(id);

    await cairn(["verify", "--runner", STUB_RUNNER], {
      CAIRN_STUB_RESULTS: JSON.stringify({ "*": "passed" }),
    });
    const red = await cairn(["verify", "--runner", STUB_RUNNER], {
      CAIRN_STUB_RESULTS: JSON.stringify({ "*": "failed" }),
    });

    expect(red.code).toBe(1);
    expect((await project.stone(id)).stone.status).toBe("broken");
  });

  /**
   * `cairn list | head -3` hangs up on us mid-write. Node surfaces that as an
   * asynchronous EPIPE error event, which used to kill the process with a stack
   * trace; the reader going away must stay invisible and must not disturb the
   * exit code.
   */
  it("survives a reader that hangs up, keeping its exit code", async () => {
    await cairn(["init"]);
    for (const n of [1, 2, 3]) {
      await cairn(["add", "--title", `Stone ${n}`, "--acceptance", "the shopper sees the total", "--request", "x"]);
    }

    /** Runs the binary with the pipes closed the instant it starts writing. */
    const withClosedPipes = (args: string[]) =>
      new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [BIN, ...args], {
          cwd: project.root,
          env: { ...process.env, NO_COLOR: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
        child.stdout.destroy();
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stderr }));
      });

    const listed = await withClosedPipes(["list"]);
    expect(listed.stderr).not.toContain("EPIPE");
    expect(listed.code).toBe(0);

    // A refusal still reports 2 even when nobody is listening.
    const refused = await withClosedPipes([
      "add",
      "--title",
      "Bad",
      "--acceptance",
      "the #total element shows the price",
      "--request",
      "x",
    ]);
    expect(refused.stderr).not.toContain("Unhandled");
    expect(refused.code).toBe(2);
  });
});
