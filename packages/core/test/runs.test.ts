import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendRunEvent,
  attemptsFrom,
  distribution,
  flakyFlips,
  hasEscalated,
  isFlaky,
  lastRunAttempt,
  maxAttempt,
  median,
  nextAttempt,
  parseRunLedger,
  proofEditedShare,
  proofEditedSince,
  readRunLedger,
  runAttempts,
  runLedgerName,
  runLedgerPathFor,
  runsDirFor,
  safeParseRunEvent,
  serializeRunEvent,
  share,
  tokensFrom,
  type RunEvent,
  type RunEventInput,
} from "../src/runs.js";
import { ID_A, ID_B } from "./helpers.js";

/** A `run` line with sensible defaults; override anything. */
function run(patch: Partial<Extract<RunEventInput, { kind: "run" }>> = {}): RunEvent {
  return {
    kind: "run",
    at: "2026-08-03T10:00:00.000Z",
    result: "green",
    attempt: 1,
    ...patch,
  } as RunEvent;
}

describe("the run event schema", () => {
  it("accepts the three kinds of line", () => {
    expect(safeParseRunEvent(run()).success).toBe(true);
    expect(
      safeParseRunEvent({ kind: "escalate", at: "2026-08-03T10:00:00.000Z", attempts: 3 }).success,
    ).toBe(true);
    expect(
      safeParseRunEvent({ kind: "amend", at: "2026-08-03T10:00:00.000Z", amendedBy: ID_B }).success,
    ).toBe(true);
  });

  it("refuses a line that is not one of them", () => {
    expect(safeParseRunEvent({ kind: "review", at: "2026-08-03T10:00:00.000Z" }).success).toBe(false);
    expect(safeParseRunEvent({ kind: "run", at: "yesterday", result: "green", attempt: 1 }).success).toBe(
      false,
    );
    // Attempts are 1-based: attempt 0 never happened.
    expect(safeParseRunEvent(run({ attempt: 0 })).success).toBe(false);
    // "missing" is not a run: it never reaches the ledger.
    expect(safeParseRunEvent({ ...run(), result: "missing" }).success).toBe(false);
    expect(safeParseRunEvent({ kind: "amend", at: "2026-08-03T10:00:00.000Z", amendedBy: "nope" }).success).toBe(
      false,
    );
  });
});

describe("serializeRunEvent", () => {
  it("writes one line, newline terminated, in a stable field order", () => {
    const line = serializeRunEvent(run({ commit: "abc1234", tokens: 4200, source: "verify" }));

    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().includes("\n")).toBe(false);
    expect(line.trimEnd()).toBe(
      '{"kind":"run","at":"2026-08-03T10:00:00.000Z","result":"green","attempt":1,' +
        '"commit":"abc1234","tokens":4200,"source":"verify"}',
    );
  });

  it("round-trips through parseRunLedger", () => {
    const events = [
      run({ result: "red" }),
      run({ attempt: 2, proofEdited: true }),
      { kind: "escalate", at: "2026-08-03T11:00:00.000Z", attempts: 2 } as RunEvent,
    ];
    const content = events.map(serializeRunEvent).join("");

    expect(parseRunLedger(content)).toEqual({ events, skipped: 0 });
  });
});

describe("parseRunLedger", () => {
  it("keeps the good lines and counts the bad ones", () => {
    const content = [
      serializeRunEvent(run()),
      "{ not json\n",
      '{"kind":"run","at":"2026-08-03T10:00:00.000Z"}\n',
      serializeRunEvent(run({ attempt: 2 })),
      '{"kind":"run","at":"2026-08-03T10:0', // a killed CI job, mid-write
    ].join("");

    const { events, skipped } = parseRunLedger(content);
    expect(events).toHaveLength(2);
    expect(events.map((event) => (event.kind === "run" ? event.attempt : 0))).toEqual([1, 2]);
    expect(skipped).toBe(3);
  });

  it("ignores blank lines, which are not corruption", () => {
    expect(parseRunLedger(`\n\n${serializeRunEvent(run())}\n   \n`)).toEqual({
      events: [run()],
      skipped: 0,
    });
    expect(parseRunLedger("")).toEqual({ events: [], skipped: 0 });
  });
});

describe("ledger paths", () => {
  it("puts runs next to the stones, whatever the stones directory is", () => {
    expect(runsDirFor(path.join("/p", ".cairn", "stones"))).toBe(path.join("/p", ".cairn", "runs"));
    expect(runsDirFor(path.join("/p", "registry", "stones"))).toBe(path.join("/p", "registry", "runs"));
  });

  it("names one ledger per stone", () => {
    expect(runLedgerName(ID_A)).toBe(`${ID_A}.jsonl`);
    expect(runLedgerPathFor(path.join("/p", ".cairn", "stones"), ID_A)).toBe(
      path.join("/p", ".cairn", "runs", `${ID_A}.jsonl`),
    );
  });
});

describe("counting attempts", () => {
  const events: RunEvent[] = [
    run({ result: "red" }),
    run({ attempt: 2, result: "red" }),
    { kind: "escalate", at: "2026-08-03T11:00:00.000Z", attempts: 2 },
  ];

  it("counts only the run lines", () => {
    expect(runAttempts(events)).toHaveLength(2);
    expect(maxAttempt(events)).toBe(2);
    expect(attemptsFrom(events)).toBe(2);
    expect(nextAttempt(events)).toBe(3);
    expect(lastRunAttempt(events)?.attempt).toBe(2);
  });

  it("is 0 / 1 on an empty ledger", () => {
    expect(maxAttempt([])).toBe(0);
    expect(attemptsFrom([])).toBe(0);
    expect(nextAttempt([])).toBe(1);
    expect(lastRunAttempt([])).toBeUndefined();
  });

  it("trusts the highest attempt number when a line was lost", () => {
    // Line 1 and 2 are gone (a truncated ledger); the numbering survives.
    expect(attemptsFrom([run({ attempt: 3 })])).toBe(3);
    expect(nextAttempt([run({ attempt: 3 })])).toBe(4);
  });

  it("sees an escalation", () => {
    expect(hasEscalated(events)).toBe(true);
    expect(hasEscalated([run()])).toBe(false);
  });
});

describe("proofEditedSince", () => {
  it("compares the proof about to run with the one that ran last", () => {
    expect(proofEditedSince([run({ proofHash: "aaa" })], "bbb")).toBe(true);
    expect(proofEditedSince([run({ proofHash: "aaa" })], "aaa")).toBe(false);
  });

  it("says nothing rather than false when there is nothing to compare", () => {
    expect(proofEditedSince([], "aaa")).toBeUndefined();
    expect(proofEditedSince([run()], "aaa")).toBeUndefined();
    expect(proofEditedSince([run({ proofHash: "aaa" })], undefined)).toBeUndefined();
  });
});

describe("tokensFrom", () => {
  it("sums what was recorded", () => {
    expect(tokensFrom([run({ tokens: 100 }), run({ attempt: 2, tokens: 250 })])).toBe(350);
  });

  it("is null when nothing ever recorded tokens — not 0", () => {
    expect(tokensFrom([run(), run({ attempt: 2 })])).toBeNull();
    expect(tokensFrom([])).toBeNull();
  });

  it("counts the tokens an escalation summarised", () => {
    expect(tokensFrom([run({ tokens: 100 }), { kind: "escalate", at: "2026-08-03T11:00:00.000Z", tokens: 50 }])).toBe(
      150,
    );
  });
});

describe("proofEditedShare", () => {
  it("only counts attempts that can answer the question", () => {
    const events = [
      run({ result: "red" }), // first attempt: nothing to compare
      run({ attempt: 2, result: "red", proofEdited: true }),
      run({ attempt: 3, proofEdited: false }),
    ];
    expect(proofEditedShare(events)).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
  });

  it("divides nothing by nothing without inventing a 0", () => {
    expect(proofEditedShare([run()]).rate).toBeNull();
    expect(share(0, 0).rate).toBeNull();
    expect(share(1, 4).rate).toBe(0.25);
  });
});

describe("flakyFlips", () => {
  it("catches a red then a green on the very same commit", () => {
    const events = [
      run({ result: "red", commit: "abc", proofHash: "h" }),
      run({ attempt: 2, result: "green", commit: "abc", proofHash: "h", proofEdited: false }),
    ];
    expect(flakyFlips(events)).toEqual([{ from: 1, to: 2, evidence: "same-commit" }]);
    expect(isFlaky(events)).toBe(true);
  });

  it("does not blame the proof when the code changed in between", () => {
    const events = [
      run({ result: "red", commit: "abc" }),
      run({ attempt: 2, result: "green", commit: "def" }),
    ];
    expect(flakyFlips(events)).toEqual([]);
    expect(isFlaky(events)).toBe(false);
  });

  it("does not blame the run when the proof was rewritten", () => {
    const events = [
      run({ result: "red", commit: "abc", proofHash: "h1" }),
      run({ attempt: 2, result: "green", commit: "abc", proofHash: "h2", proofEdited: true }),
    ];
    expect(flakyFlips(events)).toEqual([]);
  });

  it("falls back to the weaker branch when no commit was recorded, and says so", () => {
    const events = [
      run({ result: "red", proofHash: "h" }),
      run({ attempt: 2, result: "green", proofHash: "h", proofEdited: false }),
    ];
    expect(flakyFlips(events)).toEqual([{ from: 1, to: 2, evidence: "no-commit-info" }]);
  });

  it("ignores a green that was already green, and a red that stayed red", () => {
    expect(flakyFlips([run({ commit: "a" }), run({ attempt: 2, commit: "a" })])).toEqual([]);
    expect(
      flakyFlips([
        run({ result: "red", commit: "a" }),
        run({ attempt: 2, result: "red", commit: "a" }),
      ]),
    ).toEqual([]);
    expect(flakyFlips([])).toEqual([]);
  });

  it("reports every flip of a long ledger", () => {
    const events = [
      run({ result: "red", commit: "a" }),
      run({ attempt: 2, result: "green", commit: "a" }),
      run({ attempt: 3, result: "red", commit: "a" }),
      run({ attempt: 4, result: "green", commit: "a" }),
    ];
    expect(flakyFlips(events)).toHaveLength(2);
  });
});

describe("median and distribution", () => {
  it("takes the middle value, or the mean of the two middles", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([7])).toBe(7);
  });

  it("is null on an empty sample", () => {
    expect(median([])).toBeNull();
  });

  it("counts how many stones landed on each value, in order", () => {
    expect(distribution([3, 1, 1, 2])).toEqual({ "1": 2, "2": 1, "3": 1 });
    expect(Object.keys(distribution([3, 1, 2]))).toEqual(["1", "2", "3"]);
    expect(distribution([])).toEqual({});
  });
});

describe("reading and appending a ledger", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "cairn-runs-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("treats a missing ledger as an empty one", async () => {
    expect(await readRunLedger(path.join(dir, "runs", runLedgerName(ID_A)))).toEqual({
      events: [],
      skipped: 0,
    });
  });

  it("appends, creating the runs directory on the way", async () => {
    const filePath = runLedgerPathFor(path.join(dir, "stones"), ID_A);

    await appendRunEvent(filePath, run({ result: "red" }));
    await appendRunEvent(filePath, run({ attempt: 2 }));

    expect((await readFile(filePath, "utf8")).split("\n").filter(Boolean)).toHaveLength(2);
    const { events } = await readRunLedger(filePath);
    expect(events.map((event) => (event.kind === "run" ? event.result : null))).toEqual([
      "red",
      "green",
    ]);
  });

  it("refuses to append a line that is not a valid event", async () => {
    const filePath = runLedgerPathFor(path.join(dir, "stones"), ID_A);
    await expect(appendRunEvent(filePath, { kind: "run", at: "nope" } as never)).rejects.toThrow();
  });

  it("reads around a corrupted line instead of giving up on the file", async () => {
    const filePath = runLedgerPathFor(path.join(dir, "stones"), ID_A);
    await appendRunEvent(filePath, run());
    await writeFile(filePath, `${await readFile(filePath, "utf8")}{"kind":"run"\n`, "utf8");

    expect(await readRunLedger(filePath)).toEqual({ events: [run()], skipped: 1 });
  });
});
