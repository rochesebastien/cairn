import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  StoneFileError,
  defaultProofPath,
  listStones,
  parseStoneFile,
  proofFileName,
  readStone,
  readStoneById,
  resolveProofPath,
  serializeStone,
  stoneFileName,
  stonePath,
  toPosixPath,
  writeStone,
  writeStoneToDir,
} from "../src/stone-file.js";
import { ID_A, ID_B, ID_C, makeStone } from "./helpers.js";

const BODY = [
  "# Connexion",
  "",
  "L'utilisateur arrive sur la page d'accueil et se connecte.",
  "",
  "- Il voit son nom en haut à droite",
].join("\n");

describe("serializeStone / parseStoneFile", () => {
  it("round-trips a full stone (LF)", () => {
    const stone = makeStone({
      status: "proven",
      surface: "auth",
      amends: ID_B,
      amendedBy: null,
      acceptance: ["Le visiteur voit son tableau de bord", "Il peut se déconnecter"],
      provenance: { request: "je veux me connecter", attempts: 3, tokens: 4200 },
      lastGreen: { at: "2026-08-03T12:00:00.000Z", commit: "abc1234", proofHash: "deadbeef" },
      proof: ".cairn/proofs/x.spec.ts",
    });

    const text = serializeStone(stone, BODY);
    const parsed = parseStoneFile(text);

    expect(parsed.stone).toEqual(stone);
    expect(parsed.body).toBe(BODY);
  });

  it("round-trips a minimal stone", () => {
    const stone = makeStone({ acceptance: [] });
    const parsed = parseStoneFile(serializeStone(stone, ""));
    expect(parsed.stone).toEqual(stone);
    expect(parsed.body).toBe("");
  });

  it("is idempotent: serialize(parse(serialize(x))) === serialize(x)", () => {
    const stone = makeStone({ surface: "auth" });
    const once = serializeStone(stone, BODY);
    const parsed = parseStoneFile(once);
    expect(serializeStone(parsed.stone, parsed.body)).toBe(once);
  });

  it("tolerates CRLF line endings", () => {
    const stone = makeStone({ surface: "auth", proof: ".cairn/proofs/y.spec.ts" });
    const crlf = serializeStone(stone, BODY).replace(/\n/g, "\r\n");
    const parsed = parseStoneFile(crlf);

    expect(parsed.stone).toEqual(stone);
    expect(parsed.body).toBe(BODY);
    expect(parsed.body).not.toContain("\r");
  });

  it("tolerates a leading BOM and a CRLF body", () => {
    const stone = makeStone();
    const withBom = `\uFEFF${serializeStone(stone, BODY).replace(/\n/g, "\r\n")}`;
    expect(parseStoneFile(withBom).stone).toEqual(stone);
  });

  it("always writes LF, never CRLF", () => {
    expect(serializeStone(makeStone(), BODY.replace(/\n/g, "\r\n"))).not.toContain("\r");
  });

  it("keeps ULIDs, ISO dates and yes/no-ish titles as strings", () => {
    const stone = makeStone({ title: "No", createdAt: "2026-08-03T10:00:00.000Z" });
    const text = serializeStone(stone, "");
    const parsed = parseStoneFile(text);
    expect(parsed.stone.title).toBe("No");
    expect(parsed.stone.createdAt).toBe("2026-08-03T10:00:00.000Z");
    expect(parsed.stone.id).toBe(ID_A);
  });

  it("preserves accents, apostrophes and colons in criteria", () => {
    const acceptance = [
      "L'utilisateur voit « Bonjour, Émilie » en haut de page",
      "Le total affiché est : 12,50 €",
    ];
    const parsed = parseStoneFile(serializeStone(makeStone({ acceptance }), ""));
    expect(parsed.stone.acceptance).toEqual(acceptance);
  });

  it("writes fields in a stable order", () => {
    const text = serializeStone(makeStone({ surface: "auth" }), "");
    const keys = text
      .split("---")[1]!
      .split("\n")
      .filter((line) => /^\w+:/.test(line))
      .map((line) => line.split(":")[0]);
    expect(keys).toEqual([
      "id",
      "title",
      "status",
      "createdAt",
      "surface",
      "amends",
      "amendedBy",
      "acceptance",
      "provenance",
      "lastGreen",
      "proof",
    ]);
  });

  it("omits an absent surface instead of writing null", () => {
    expect(serializeStone(makeStone(), "")).not.toContain("surface");
  });

  it("throws on missing frontmatter", () => {
    expect(() => parseStoneFile("# just markdown")).toThrow(StoneFileError);
  });

  it("throws on invalid YAML", () => {
    expect(() => parseStoneFile("---\nid: [unclosed\n---\nbody")).toThrow(StoneFileError);
  });

  it("throws with structured issues on schema violations", () => {
    const text = serializeStone(makeStone(), "").replace(ID_A, "nope");
    try {
      parseStoneFile(text, "/tmp/bad.md");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StoneFileError);
      const err = error as StoneFileError;
      expect(err.filePath).toBe("/tmp/bad.md");
      expect(err.issues?.join(" ")).toContain("id");
      expect(err.message).toContain("/tmp/bad.md");
    }
  });

  it("accepts a hand-written file with unquoted scalars", () => {
    const text = [
      "---",
      `id: ${ID_A}`,
      "title: Connexion",
      "status: draft",
      "createdAt: 2026-08-03T10:00:00.000Z",
      "acceptance:",
      "  - Le visiteur se connecte",
      "provenance:",
      "  request: je veux me connecter",
      "---",
      "",
      "Corps.",
    ].join("\n");

    const parsed = parseStoneFile(text);
    expect(parsed.stone.id).toBe(ID_A);
    expect(parsed.stone.createdAt).toBe("2026-08-03T10:00:00.000Z");
    expect(parsed.stone.acceptance).toEqual(["Le visiteur se connecte"]);
    expect(parsed.body).toBe("Corps.");
  });
});

describe("paths", () => {
  it("builds stone and proof file names", () => {
    expect(stoneFileName(ID_A)).toBe(`${ID_A}.md`);
    expect(proofFileName(ID_A)).toBe(`${ID_A}.spec.ts`);
    expect(toPosixPath(stonePath(".cairn/stones", ID_A))).toBe(`.cairn/stones/${ID_A}.md`);
  });

  it("stores proof paths POSIX-style regardless of platform", () => {
    expect(defaultProofPath(ID_A)).toBe(`.cairn/proofs/${ID_A}.spec.ts`);
    expect(defaultProofPath(ID_A, "tests/proofs")).toBe(`tests/proofs/${ID_A}.spec.ts`);
    expect(defaultProofPath(ID_A)).not.toContain("\\");
  });

  it("resolves a POSIX proof path natively", () => {
    const resolved = resolveProofPath("/repo", `.cairn/proofs/${ID_A}.spec.ts`);
    expect(resolved).toBe(path.resolve("/repo", ".cairn", "proofs", `${ID_A}.spec.ts`));
  });
});

describe("filesystem helpers", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cairn-core-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes and reads a stone, creating directories", async () => {
    const stonesDir = path.join(dir, ".cairn", "stones");
    const stone = makeStone({ surface: "auth" });
    const filePath = await writeStoneToDir(stonesDir, stone, BODY);

    expect(filePath).toBe(path.join(stonesDir, `${ID_A}.md`));
    const onDisk = await readStone(filePath);
    expect(onDisk.stone).toEqual(stone);
    expect(onDisk.body).toBe(BODY);
    expect(onDisk.filePath).toBe(filePath);

    const byId = await readStoneById(stonesDir, ID_A);
    expect(byId.stone).toEqual(stone);
  });

  it("ends the file with a single newline", async () => {
    const filePath = path.join(dir, `${ID_A}.md`);
    await writeStone(filePath, makeStone(), BODY);
    const raw = await readFile(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
  });

  it("lists stones sorted by id and ignores non-markdown files", async () => {
    await writeStoneToDir(dir, makeStone({ id: ID_C }), "c");
    await writeStoneToDir(dir, makeStone({ id: ID_A }), "a");
    await writeStoneToDir(dir, makeStone({ id: ID_B }), "b");
    await writeFile(path.join(dir, "notes.txt"), "ignore me", "utf8");
    await mkdir(path.join(dir, "sub.md"), { recursive: true });

    const stones = await listStones(dir, { onError: "skip" });
    expect(stones.map((s) => s.stone.id)).toEqual([ID_A, ID_B, ID_C]);
  });

  it("returns [] for a missing directory", async () => {
    expect(await listStones(path.join(dir, "nope"))).toEqual([]);
  });

  it("throws by default on a malformed stone, skips on demand", async () => {
    await writeStoneToDir(dir, makeStone(), "ok");
    await writeFile(path.join(dir, "broken.md"), "not a stone", "utf8");

    await expect(listStones(dir)).rejects.toBeInstanceOf(StoneFileError);

    const skipped: string[] = [];
    const stones = await listStones(dir, {
      onError: "skip",
      onSkip: (filePath) => skipped.push(path.basename(filePath)),
    });
    expect(stones).toHaveLength(1);
    expect(skipped).toEqual(["broken.md"]);
  });

  it("survives a CRLF file on disk (Windows checkout)", async () => {
    const stone = makeStone();
    const filePath = path.join(dir, `${ID_A}.md`);
    await writeFile(filePath, serializeStone(stone, BODY).replace(/\n/g, "\r\n"), "utf8");
    const read = await readStone(filePath);
    expect(read.stone).toEqual(stone);
    expect(read.body).toBe(BODY);
  });

  it("wraps read errors", async () => {
    await expect(readStone(path.join(dir, "absent.md"))).rejects.toBeInstanceOf(StoneFileError);
  });
});
