import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/bin.js";

describe("cairn-mcp argument parsing", () => {
  it("defaults to no directory, so the cwd is used", () => {
    expect(parseArgs([], {})).toEqual({});
  });

  it("takes --dir in all its shapes", () => {
    expect(parseArgs(["--dir", "/tmp/project"], {})).toEqual({ dir: "/tmp/project" });
    expect(parseArgs(["-d", "/tmp/project"], {})).toEqual({ dir: "/tmp/project" });
    expect(parseArgs(["--dir=/tmp/project"], {})).toEqual({ dir: "/tmp/project" });
  });

  it("falls back to CAIRN_DIR, but the flag wins", () => {
    expect(parseArgs([], { CAIRN_DIR: "/tmp/env" })).toEqual({ dir: "/tmp/env" });
    expect(parseArgs(["--dir", "/tmp/flag"], { CAIRN_DIR: "/tmp/env" })).toEqual({
      dir: "/tmp/flag",
    });
  });

  it("understands --help and --version", () => {
    expect(parseArgs(["--help"], {})).toEqual({ help: true });
    expect(parseArgs(["-v"], {})).toEqual({ version: true });
  });

  it("refuses what it does not understand", () => {
    expect(() => parseArgs(["--dir"], {})).toThrow(/needs a path/);
    expect(() => parseArgs(["--wat"], {})).toThrow(/Unknown argument/);
  });
});
