import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNNERS,
  parsePlaywrightReport,
  resolveRunners,
  statusForProof,
} from "../src/playwright.js";
import { tokenize } from "../src/proc.js";

/** A realistic Playwright JSON report: file suites, nested describes, retries. */
const REPORT = {
  config: { rootDir: "/repo" },
  suites: [
    {
      title: ".cairn/proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts",
      file: ".cairn/proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts",
      specs: [
        {
          title: "the shopper sees the total",
          ok: true,
          file: ".cairn/proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts",
          tests: [{ status: "expected", results: [{ status: "passed" }] }],
        },
      ],
    },
    {
      title: ".cairn/proofs/01BX5ZZKBKACTAV9WEVGEMMVRZ.spec.ts",
      file: ".cairn/proofs/01BX5ZZKBKACTAV9WEVGEMMVRZ.spec.ts",
      specs: [],
      suites: [
        {
          title: "when the cart is empty",
          specs: [
            {
              title: "refuses to pay",
              ok: false,
              tests: [
                {
                  status: "unexpected",
                  results: [{ status: "failed" }, { status: "failed" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: ".cairn/proofs/01C0000000000000000000000.spec.ts",
      file: ".cairn/proofs/01C0000000000000000000000.spec.ts",
      specs: [
        {
          title: "flaky but green in the end",
          ok: true,
          tests: [{ status: "flaky", results: [{ status: "failed" }, { status: "passed" }] }],
        },
      ],
    },
  ],
  errors: [],
};

describe("parsePlaywrightReport", () => {
  it("reads one result per proof file", () => {
    const parsed = parsePlaywrightReport(REPORT);

    expect(parsed.specCount).toBe(3);
    expect(parsed.byFile.get("01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts")).toBe("passed");
    expect(parsed.byFile.get("01BX5ZZKBKACTAV9WEVGEMMVRZ.spec.ts")).toBe("failed");
    expect(parsed.byFile.get("01C0000000000000000000000.spec.ts")).toBe("passed");
    expect(parsed.errors).toEqual([]);
  });

  it("inherits the file of a nested describe suite", () => {
    const parsed = parsePlaywrightReport(REPORT);
    expect(parsed.byPath.get(".cairn/proofs/01BX5ZZKBKACTAV9WEVGEMMVRZ.spec.ts")).toBe("failed");
  });

  it("fails a file as soon as one of its specs fails", () => {
    const parsed = parsePlaywrightReport({
      suites: [
        {
          file: "proofs/mixed.spec.ts",
          specs: [
            { title: "a", ok: true, tests: [{ status: "expected" }] },
            { title: "b", ok: false, tests: [{ status: "unexpected" }] },
          ],
        },
      ],
    });
    expect(parsed.byFile.get("mixed.spec.ts")).toBe("failed");
  });

  it("treats an all-skipped file as skipped, not as green", () => {
    const parsed = parsePlaywrightReport({
      suites: [
        {
          file: "proofs/skipped.spec.ts",
          specs: [{ title: "a", tests: [{ status: "skipped", results: [{ status: "skipped" }] }] }],
        },
      ],
    });
    expect(parsed.byFile.get("skipped.spec.ts")).toBe("skipped");
  });

  it("counts a timeout as a failure", () => {
    const parsed = parsePlaywrightReport({
      suites: [
        {
          file: "proofs/slow.spec.ts",
          specs: [{ title: "a", tests: [{ status: "unexpected", results: [{ status: "timedOut" }] }] }],
        },
      ],
    });
    expect(parsed.byFile.get("slow.spec.ts")).toBe("failed");
  });

  it("collects runner-level errors", () => {
    const parsed = parsePlaywrightReport({
      suites: [],
      errors: [{ message: "no tests found" }, "raw string error"],
    });
    expect(parsed.errors).toEqual(["no tests found", "raw string error"]);
    expect(parsed.specCount).toBe(0);
  });

  it("survives junk without throwing", () => {
    expect(parsePlaywrightReport(null).specCount).toBe(0);
    expect(parsePlaywrightReport({}).byFile.size).toBe(0);
    expect(parsePlaywrightReport({ suites: [{ specs: [{ title: "orphan", ok: true }] }] }).byFile.size).toBe(0);
  });

  it("normalises Windows separators reported by the runner", () => {
    const parsed = parsePlaywrightReport({
      suites: [
        {
          file: ".cairn\\proofs\\01D.spec.ts",
          specs: [{ title: "a", ok: true, tests: [{ status: "expected" }] }],
        },
      ],
    });
    expect(statusForProof(parsed, ".cairn/proofs/01D.spec.ts")).toBe("passed");
  });
});

describe("statusForProof", () => {
  const parsed = parsePlaywrightReport(REPORT);

  it("matches on the full path", () => {
    expect(statusForProof(parsed, ".cairn/proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts")).toBe("passed");
  });

  it("falls back to the basename when testDir shifted the reported path", () => {
    const shifted = parsePlaywrightReport({
      suites: [
        {
          file: "proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts",
          specs: [{ title: "a", ok: true, tests: [{ status: "expected" }] }],
        },
      ],
    });
    expect(statusForProof(shifted, ".cairn/proofs/01ARZ3NDEKTSV4RRFFQ69G5FAV.spec.ts")).toBe("passed");
  });

  it("returns undefined for a proof nobody ran", () => {
    expect(statusForProof(parsed, ".cairn/proofs/01NOTHING.spec.ts")).toBeUndefined();
  });
});

describe("resolveRunners", () => {
  it("prefers the explicit runner", () => {
    expect(resolveRunners("node stub.mjs", {})).toEqual(["node stub.mjs"]);
  });

  it("then the environment", () => {
    expect(resolveRunners(undefined, { CAIRN_PLAYWRIGHT_CMD: "yarn playwright test" })).toEqual([
      "yarn playwright test",
    ]);
  });

  it("then pnpm, then npx", () => {
    expect(resolveRunners(undefined, {})).toEqual([...DEFAULT_RUNNERS]);
    expect(DEFAULT_RUNNERS[0]).toContain("pnpm");
    expect(DEFAULT_RUNNERS[1]).toContain("npx");
  });

  it("ignores a blank override", () => {
    expect(resolveRunners("   ", {})).toEqual([...DEFAULT_RUNNERS]);
  });
});

describe("tokenize", () => {
  it("splits a plain command line", () => {
    expect(tokenize("pnpm exec playwright test")).toEqual(["pnpm", "exec", "playwright", "test"]);
  });

  it("keeps quoted paths in one piece", () => {
    expect(tokenize('node "C:\\Program Files\\proofs\\run.mjs" --flag')).toEqual([
      "node",
      "C:\\Program Files\\proofs\\run.mjs",
      "--flag",
    ]);
  });

  it("supports single quotes and empty arguments", () => {
    expect(tokenize("sh -c 'echo hello'")).toEqual(["sh", "-c", "echo hello"]);
    expect(tokenize('node -e ""')).toEqual(["node", "-e", ""]);
  });

  it("collapses runs of whitespace", () => {
    expect(tokenize("  npx   playwright  test ")).toEqual(["npx", "playwright", "test"]);
  });

  it("returns nothing for an empty command", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});
