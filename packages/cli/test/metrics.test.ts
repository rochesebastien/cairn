import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cli, makeProject, seedStone, withStub, type TempProject } from "./helpers.js";

interface Share {
  collected: boolean;
  numerator: number;
  denominator: number;
  rate: number | null;
}

interface MetricsJson {
  ok: boolean;
  stones: number;
  ledgers: number;
  unparsableLines?: number;
  metrics: {
    provenWithoutHuman: Share;
    attemptsPerStone: {
      collected: boolean;
      median: number | null;
      min: number | null;
      max: number | null;
      samples: number;
      fromProvenance: number;
      distribution: Record<string, number>;
    };
    tokensPerProvenStone: {
      collected: boolean;
      median: number | null;
      mean: number | null;
      total: number | null;
      samples: number;
      provenStones: number;
    };
    flakyRate: Share & { stones: { id: string; flips: { evidence: string }[] }[] };
    reviewTimePerStone: { collected: boolean; reason: string };
    proofEditedShare: Share;
  };
  definitions: Record<string, string>;
}

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

/**
 * `cairn metrics` reads the ledgers written by `verify` and the provenance
 * stamped on the stones. What it cannot know it says it cannot know: no
 * metric is ever estimated, and an empty sample reports null, never 0.
 */
describe("cairn metrics", () => {
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

  async function metrics(): Promise<MetricsJson> {
    const result = await cli(["metrics", "--json"], { cwd: project.root });
    expect(result.code).toBe(0);
    return result.json<MetricsJson>();
  }

  /** A stone with a hand-written history: no runner, no browser, no clock. */
  async function seedWithLedger(
    events: Parameters<TempProject["writeLedger"]>[1],
    flags: string[] = [],
  ): Promise<string> {
    const id = await seedStone(project, ["--proof", ...flags]);
    await project.proof(id);
    if (events.length > 0) await project.writeLedger(id, events);
    return id;
  }

  const run = (
    attempt: number,
    result: "green" | "red",
    extra: Record<string, unknown> = {},
  ) => ({
    kind: "run" as const,
    at: `2026-08-0${attempt}T10:00:00.000Z`,
    result,
    attempt,
    ...extra,
  });

  it("says everything is uncollected on an empty cairn", async () => {
    const payload = await metrics();

    expect(payload.ok).toBe(true);
    expect(payload.stones).toBe(0);
    expect(payload.ledgers).toBe(0);
    expect(payload.metrics.provenWithoutHuman).toMatchObject({ collected: false, rate: null });
    expect(payload.metrics.attemptsPerStone.median).toBeNull();
    expect(payload.metrics.tokensPerProvenStone.collected).toBe(false);
    expect(payload.metrics.flakyRate.rate).toBeNull();
  });

  it("never reports review time, and says why", async () => {
    const payload = await metrics();
    expect(payload.metrics.reviewTimePerStone.collected).toBe(false);
    expect(payload.metrics.reviewTimePerStone.reason).toMatch(/no instrumentation/);
    expect(payload.definitions.reviewTimePerStone).toMatch(/not collected/);
  });

  it("carries a definition for every metric it reports", async () => {
    const payload = await metrics();
    for (const key of Object.keys(payload.metrics)) {
      expect(payload.definitions[key], key).toBeTruthy();
    }
  });

  it("counts a proven stone that never needed a human", async () => {
    const id = await seedWithLedger([run(1, "red"), run(2, "green")]);
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });

    const payload = await metrics();
    expect((await project.stone(id)).stone.status).toBe("proven");
    expect(payload.metrics.provenWithoutHuman).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
  });

  it("counts an escalated stone against the headline, proven or not", async () => {
    await seedWithLedger([run(1, "green")]);
    const escalated = await seedWithLedger([run(1, "red"), run(2, "red")]);
    await cli(["escalate", escalated], { cwd: project.root });

    // Only the first stone is proven; nothing is: neither has been verified.
    const payload = await metrics();
    expect(payload.metrics.provenWithoutHuman).toMatchObject({
      numerator: 0,
      denominator: 2,
      rate: 0,
    });
  });

  it("leaves a draft that was never run out of the denominator", async () => {
    await seedStone(project);
    const payload = await metrics();
    expect(payload.metrics.provenWithoutHuman.denominator).toBe(0);
  });

  it("takes attempts from the ledger, and from provenance when there is none", async () => {
    await seedWithLedger([run(1, "red"), run(2, "red"), run(3, "green")]);
    await seedWithLedger([], ["--attempts", "1"]);

    const payload = await metrics();
    expect(payload.metrics.attemptsPerStone).toMatchObject({
      collected: true,
      median: 2,
      min: 1,
      max: 3,
      samples: 2,
      fromProvenance: 1,
      distribution: { "1": 1, "3": 1 },
    });
  });

  it("reports tokens as not collected rather than as 0", async () => {
    await seedWithLedger([run(1, "green")]);
    const payload = await metrics();

    expect(payload.metrics.tokensPerProvenStone).toMatchObject({
      collected: false,
      median: null,
      total: null,
      samples: 0,
    });
  });

  it("sums the tokens a ledger did record, on proven stones", async () => {
    const id = await seedWithLedger([
      run(1, "red", { tokens: 1200 }),
      run(2, "green", { tokens: 3000 }),
    ]);
    stub.restore();
    stub = withStub({ results: { "*": "passed" } });
    await cli(["verify", ...stub.args], { cwd: project.root });
    expect((await project.stone(id)).stone.status).toBe("proven");

    const payload = await metrics();
    // The verify run appended a third, token-less line: the sum is unchanged.
    expect(payload.metrics.tokensPerProvenStone).toMatchObject({
      collected: true,
      total: 4200,
      median: 4200,
      mean: 4200,
      samples: 1,
      provenStones: 1,
    });
  });

  it("calls a red-then-green on the same commit flaky, and shows its evidence", async () => {
    const flaky = await seedWithLedger([
      run(1, "red", { commit: COMMIT, proofHash: "h" }),
      run(2, "green", { commit: COMMIT, proofHash: "h", proofEdited: false }),
    ]);
    // A second stone fixed by an actual code change is not flaky.
    await seedWithLedger([
      run(1, "red", { commit: COMMIT, proofHash: "h" }),
      run(2, "green", { commit: `${COMMIT.slice(0, -1)}f`, proofHash: "h", proofEdited: false }),
    ]);

    const payload = await metrics();
    expect(payload.metrics.flakyRate).toMatchObject({ numerator: 1, denominator: 2, rate: 0.5 });
    expect(payload.metrics.flakyRate.stones[0]?.id).toBe(flaky);
    expect(payload.metrics.flakyRate.stones[0]?.flips[0]?.evidence).toBe("same-commit");
  });

  it("shares the attempts where the proof was wrong rather than the product", async () => {
    await seedWithLedger([
      run(1, "red", { proofHash: "h1" }),
      run(2, "red", { proofHash: "h2", proofEdited: true }),
      run(3, "green", { proofHash: "h2", proofEdited: false }),
    ]);

    const payload = await metrics();
    expect(payload.metrics.proofEditedShare).toMatchObject({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
  });

  it("reads around a corrupted ledger line and says how many it dropped", async () => {
    const id = await seedWithLedger([run(1, "green")]);
    await project.write(
      `.cairn/runs/${id}.jsonl`,
      `${JSON.stringify(run(1, "green"))}\n{"kind":"run"\n`,
    );

    const payload = await metrics();
    expect(payload.unparsableLines).toBe(1);
    expect(payload.metrics.attemptsPerStone.samples).toBe(1);
  });

  it("prints a table a human can read", async () => {
    await seedWithLedger([run(1, "red"), run(2, "green")]);
    const result = await cli(["metrics"], { cwd: project.root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("proven without human");
    expect(result.stdout).toContain("attempts per stone");
    expect(result.stdout).toMatch(/review time per stone\s+—/);
    expect(result.stdout).toContain("desktop instrumentation pending");
  });

  it("refuses to report on a directory that holds no cairn", async () => {
    const empty = await makeProject();
    try {
      const result = await cli(["metrics", "--json"], { cwd: empty.root });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("No cairn found");
    } finally {
      await empty.cleanup();
    }
  });
});
