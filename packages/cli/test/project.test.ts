import { mkdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FALLBACK_CONFIG, findProjectRoot, loadConfigFile, loadProject } from "../src/project.js";
import { cli, makeProject, type TempProject } from "./helpers.js";

/** The config is loaded through jiti, so a TypeScript config needs no build. */
describe("project + config", () => {
  let project: TempProject;

  beforeEach(async () => {
    project = await makeProject();
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("loads a TypeScript config through jiti", async () => {
    await project.write(
      "cairn.config.ts",
      `interface Config { baseURL: string; retries: number; setup?: string }
       const config: Config = {
         baseURL: "http://localhost:4321",
         retries: 2,
         setup: "node seed.mjs",
       };
       export default config;`,
    );

    const config = await loadConfigFile(project.path("cairn.config.ts"));
    expect(config.baseURL).toBe("http://localhost:4321");
    expect(config.retries).toBe(2);
    expect(config.setup).toBe("node seed.mjs");
    // Defaults are applied by the shared zod schema, not by the CLI.
    expect(config.stonesDir).toBe(".cairn/stones");
    expect(config.proofsDir).toBe(".cairn/proofs");
  });

  it("loads a plain ESM config", async () => {
    await project.write("cairn.config.mjs", 'export default { baseURL: "http://127.0.0.1:8080" };');
    const config = await loadConfigFile(project.path("cairn.config.mjs"));
    expect(config.baseURL).toBe("http://127.0.0.1:8080");
  });

  it("accepts a config exported as a function", async () => {
    await project.write("cairn.config.ts", 'export default () => ({ baseURL: "http://lazy:1234" });');
    const config = await loadConfigFile(project.path("cairn.config.ts"));
    expect(config.baseURL).toBe("http://lazy:1234");
  });

  it("reports an invalid config instead of crashing", async () => {
    await project.write("cairn.config.ts", "export default { retries: -1 };");
    await expect(loadConfigFile(project.path("cairn.config.ts"))).rejects.toThrow(/Invalid config/);

    await cli(["init"], { cwd: project.root });
    const result = await cli(["list"], { cwd: project.root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid config");
    expect(result.stderr).toContain("baseURL");
  });

  it("reports a config that does not even load", async () => {
    await project.write("cairn.config.ts", "export default { this is not typescript ]");
    const result = await cli(["status"], { cwd: project.root });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Cannot load cairn.config.ts");
  });

  it("falls back to defaults when there is no config at all", async () => {
    const loaded = await loadProject({ dir: project.root });
    expect(loaded.configPath).toBeNull();
    expect(loaded.config).toEqual(FALLBACK_CONFIG);
  });

  it("walks up to the directory that owns the cairn", async () => {
    await cli(["init"], { cwd: project.root });
    const nested = project.path("packages", "web", "src");
    await mkdir(nested, { recursive: true });

    expect(await findProjectRoot(nested)).toBe(project.root);
    expect(await findProjectRoot(project.root)).toBe(project.root);
  });

  it("stays where it is when nothing owns a cairn", async () => {
    const nested = project.path("nothing", "here");
    await mkdir(nested, { recursive: true });
    expect(await findProjectRoot(nested)).toBe(nested);
  });

  it("honours custom stonesDir and proofsDir everywhere", async () => {
    await project.write(
      "cairn.config.ts",
      `export default {
         baseURL: "http://localhost:3000",
         stonesDir: "registry/stones",
         proofsDir: "registry/proofs",
       };`,
    );

    const init = await cli(["init", "--json"], { cwd: project.root });
    expect(init.code).toBe(0);
    expect(init.json<{ stonesDir: string }>().stonesDir).toBe(path.join("registry", "stones"));

    const added = await cli(
      [
        "add",
        "--title",
        "Custom dirs",
        "--acceptance",
        "the shopper sees the total",
        "--request",
        "je veux voir le total",
        "--proof",
        "--json",
      ],
      { cwd: project.root, stdin: "{}" },
    );

    const stone = added.json<{ stone: { id: string; proof: string }; path: string }>();
    expect(stone.stone.proof).toBe(`registry/proofs/${stone.stone.id}.spec.ts`);
    expect(stone.path).toBe(`registry/stones/${stone.stone.id}.md`);

    const list = await cli(["list", "--json"], { cwd: project.root });
    expect(list.json<{ count: number }>().count).toBe(1);
  });

  it("tolerates CRLF and a BOM in a hand-written stone", async () => {
    await cli(["init"], { cwd: project.root });
    const id = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const frontmatter = [
      "---",
      `id: ${id}`,
      "title: Written by hand",
      "status: draft",
      "createdAt: 2026-08-03T10:00:00.000Z",
      "acceptance:",
      "  - the shopper sees the total",
      "provenance:",
      "  request: je veux voir le total",
      "---",
      "",
      "# Intent",
    ].join("\r\n");

    await project.write(`.cairn/stones/${id}.md`, `﻿${frontmatter}\r\n`);

    const show = await cli(["show", id, "--json"], { cwd: project.root });
    expect(show.code).toBe(0);
    expect(show.json<{ stone: { title: string; amends: null } }>().stone.title).toBe("Written by hand");
  });

  it("reports an unreadable stone without hiding the healthy ones", async () => {
    await cli(["init"], { cwd: project.root });
    await cli(
      [
        "add",
        "--title",
        "Healthy",
        "--acceptance",
        "the shopper sees the total",
        "--request",
        "x",
      ],
      { cwd: project.root },
    );
    await project.write(".cairn/stones/01ARZ3NDEKTSV4RRFFQ69G5FAV.md", "not a stone at all");

    const list = await cli(["list", "--json"], { cwd: project.root });
    const payload = list.json<{ count: number; unreadable: string[] }>();
    expect(payload.count).toBe(1);
    expect(payload.unreadable).toHaveLength(1);

    const human = await cli(["status"], { cwd: project.root });
    expect(human.stderr).toContain("unreadable stone");
  });
});

/**
 * `cairn list` prints 8-character short ids. If they cannot be typed back in,
 * managing a cairn by hand means copying 26-character ULIDs all day.
 */
describe("stone id resolution", () => {
  let project: TempProject;

  beforeEach(async () => {
    project = await makeProject();
    await cli(["init"], { cwd: project.root });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  const add = async (title: string, id?: string) => {
    const args = [
      "add",
      "--title",
      title,
      "--acceptance",
      "the shopper sees the total",
      "--request",
      "x",
      "--json",
    ];
    if (id) args.push("--id", id);
    const result = await cli(args, { cwd: project.root });
    expect(result.code).toBe(0);
    return (JSON.parse(result.stdout) as { stone: { id: string } }).stone.id;
  };

  it("accepts a full id, a short id and a lowercased one", async () => {
    const id = await add("Le panier affiche le total");

    for (const query of [id, id.slice(0, 8), id.toLowerCase(), ` ${id.slice(0, 12)} `]) {
      const shown = await cli(["show", query, "--json"], { cwd: project.root });
      expect(shown.code, `querying ${JSON.stringify(query)}`).toBe(0);
      expect((JSON.parse(shown.stdout) as { stone: { id: string } }).stone.id).toBe(id);
    }
  });

  it("refuses an ambiguous prefix instead of guessing", async () => {
    await add("First", "01JAAAAAAAAAAAAAAAAAAAAAA1");
    await add("Second", "01JAAAAAAAAAAAAAAAAAAAAAA2");

    const shown = await cli(["show", "01JAAAAA"], { cwd: project.root });
    expect(shown.code).toBe(2);
    expect(shown.stderr).toContain("Ambiguous");
    expect(shown.stderr).toContain("01JAAAAAAAAAAAAAAAAAAAAAA1");
    expect(shown.stderr).toContain("01JAAAAAAAAAAAAAAAAAAAAAA2");
  });

  it("still refuses an id that matches nothing", async () => {
    await add("Only one");
    const shown = await cli(["show", "01ZZZZZZ"], { cwd: project.root });
    expect(shown.code).toBe(2);
    expect(shown.stderr).toContain("No stone with id");
  });

  it("lets amend, escalate and verify take a short id too", async () => {
    const id = await add("Le panier affiche le total");
    const short = id.slice(0, 8);

    const escalated = await cli(["escalate", short], { cwd: project.root });
    expect(escalated.code).toBe(0);

    const verified = await cli(["verify", short, "--no-run", "--integrity"], { cwd: project.root });
    expect(verified.code).toBe(0);

    const amended = await cli(["amend", short, "--json"], { cwd: project.root });
    expect(amended.code).toBe(0);
    const newId = (JSON.parse(amended.stdout) as { stone: { id: string } }).stone.id;
    const old = await cli(["show", id, "--json"], { cwd: project.root });
    expect((JSON.parse(old.stdout) as { stone: { status: string; amendedBy: string } }).stone).toMatchObject({
      status: "retired",
      amendedBy: newId,
    });
  });
});

/**
 * A ULID starts with 10 characters of timestamp, so 8 characters only resolve
 * to ~256 ms: stones raised back to back collide. `cairn list` must widen the
 * abbreviation until every printed id is one a human can type back.
 */
describe("printed ids stay usable", () => {
  let project: TempProject;

  beforeEach(async () => {
    project = await makeProject();
    await cli(["init"], { cwd: project.root });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it("widens the short id until it is unambiguous, and that id resolves", async () => {
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) {
      const added = await cli(
        ["add", "--title", `Stone ${n}`, "--acceptance", "the shopper sees the total", "--request", "x", "--json"],
        { cwd: project.root },
      );
      ids.push((JSON.parse(added.stdout) as { stone: { id: string } }).stone.id);
    }
    // Raised in the same breath: the naive 8-character prefix is not unique.
    expect(new Set(ids.map((id) => id.slice(0, 8))).size).toBeLessThan(ids.length);

    const listed = await cli(["list"], { cwd: project.root });
    // Rows read `· draft  <id>  <title>  …`; the id is the third token.
    const printed = listed.stdout
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/)[2])
      .filter((cell): cell is string => Boolean(cell));

    expect(printed).toHaveLength(ids.length);
    expect(new Set(printed).size).toBe(ids.length);

    // Every id the list printed must round-trip through `cairn show`.
    for (const short of printed) {
      const shown = await cli(["show", short, "--json"], { cwd: project.root });
      expect(shown.code, `showing ${short}`).toBe(0);
      expect(ids).toContain((JSON.parse(shown.stdout) as { stone: { id: string } }).stone.id);
    }
  });
});
