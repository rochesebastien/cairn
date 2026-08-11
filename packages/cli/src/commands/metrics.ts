import {
  attemptsFrom,
  distribution,
  flakyFlips,
  hasEscalated,
  median,
  proofEditedShare,
  runAttempts,
  share,
  tokensFrom,
  type RunEvent,
  type Share,
  type StoneFile,
} from "@usecairn/core";
import pc from "picocolors";
import { EXIT } from "../errors.js";
import { printJson, printWarn, renderTable } from "../format.js";
import type { Io } from "../io.js";
import { readLedger } from "../ledger.js";
import { loadProject, readAllStones, requireCairn } from "../project.js";

/**
 * The five numbers of Phase 6 (docs/technical.md), read off the run ledgers in
 * `.cairn/runs/` and the stones themselves.
 *
 * Two rules hold everywhere here. Every metric is reported with the raw
 * numerator and denominator it came from, so nobody has to trust the ratio.
 * And a metric with no data says so instead of saying 0 — a fabricated zero is
 * worse than a hole, because it looks like an answer.
 */

export interface MetricsOptions {
  dir?: string;
  json?: boolean;
}

/** The small print, emitted with every `--json` report. */
export const DEFINITIONS: Record<string, string> = {
  provenWithoutHuman:
    "Stones that are proven and were never escalated, over the stones the loop has actually " +
    "decided: every proven, broken or escalated stone, every draft with at least one run in " +
    "its ledger, and every retired stone whose ledger shows it was escalated before a human " +
    "amended it. A retired stone that was simply superseded is left out — the amendment " +
    "carries the intent forward and counting both halves would count one feature twice; a " +
    "retired stone whose ledger is gone cannot be told from that case and is left out too.",
  attemptsPerStone:
    "Highest attempt number recorded in each stone's ledger, falling back to " +
    "provenance.attempts when the ledger is absent (runs/ is not committed). Stones that " +
    "were never run contribute nothing, and a stone raised by `cairn amend` inherits the " +
    "provenance of the stone it supersedes, so only its own ledger counts for it.",
  tokensPerProvenStone:
    "Sum of the tokens field over each proven stone's ledger, falling back to " +
    "provenance.tokens. Nothing writes tokens automatically yet, so this is normally " +
    "reported as not collected.",
  flakyRate:
    "Stones whose ledger holds a red immediately followed by a green with no code change " +
    "in between — same commit on both runs, or no commit recorded and no proof edit — " +
    "over the stones with at least two runs.",
  reviewTimePerStone:
    "Wall-clock from a draft being raised to a human deciding on it, in the desktop " +
    "review view. Nothing instruments that yet: it is not collected, and it is not " +
    "estimated from anything else.",
  proofEditedShare:
    "Share of attempts where the proof changed rather than the product, over the attempts " +
    "that can answer the question (a first attempt, or one with no hash to compare, " +
    "counts in neither term).",
};

/** What one stone contributes to the numbers. */
interface StoneMetrics {
  file: StoneFile;
  events: RunEvent[];
  /** Lines of its ledger that could not be parsed. */
  skipped: number;
  runs: number;
  attempts: number;
  /** Where `attempts` came from: an absent ledger falls back to the stone. */
  attemptsSource: "ledger" | "provenance" | "none";
  tokens: number | null;
  escalated: boolean;
  flaky: boolean;
}

export async function metricsCommand(io: Io, options: MetricsOptions = {}): Promise<number> {
  const project = await loadProject({ dir: options.dir });
  await requireCairn(project);

  const { stones, skipped } = await readAllStones(project);

  const rows: StoneMetrics[] = [];
  const warnings: string[] = [];
  for (const file of stones) {
    const ledger = await readLedger(project, file.stone.id);
    if (ledger.warning) warnings.push(ledger.warning);
    rows.push(measure(file, ledger.events, ledger.skipped));
  }

  const metrics = {
    provenWithoutHuman: provenWithoutHuman(rows),
    attemptsPerStone: attemptsPerStone(rows),
    tokensPerProvenStone: tokensPerProvenStone(rows),
    flakyRate: flakyRate(rows),
    reviewTimePerStone: {
      collected: false,
      reason: "no instrumentation yet — the desktop review view does not time anything",
    },
    proofEditedShare: proofEdited(rows),
  };

  const ledgers = rows.filter((row) => row.events.length > 0).length;
  const unparsable = rows.reduce((total, row) => total + row.skipped, 0);

  if (options.json) {
    printJson(io, {
      ok: true,
      root: project.root,
      stones: stones.length,
      ledgers,
      ...(unparsable > 0 ? { unparsableLines: unparsable } : {}),
      metrics,
      definitions: DEFINITIONS,
      ...(skipped.length > 0 ? { unreadable: skipped } : {}),
      ...(warnings.length > 0 ? { ledgerWarnings: warnings } : {}),
    });
    return EXIT.OK;
  }

  for (const problem of skipped) printWarn(io, `unreadable stone ${problem}`);
  for (const warning of warnings) printWarn(io, warning);
  if (unparsable > 0) printWarn(io, `${unparsable} unparsable ledger line(s), skipped`);

  const ledgerCount = `${ledgers} ledger${ledgers === 1 ? "" : "s"}`;
  io.out(
    `${pc.bold("cairn metrics")} ${pc.dim(project.root)}  ${pc.dim(`${stones.length} stone${stones.length === 1 ? "" : "s"} · ${ledgerCount}`)}`,
  );
  io.out("");

  const table = renderTable(
    ["metric", "value", "over"],
    [
      [
        "proven without human",
        percent(metrics.provenWithoutHuman),
        over(metrics.provenWithoutHuman, "decided stone", "decided stones"),
      ],
      [
        "attempts per stone",
        metrics.attemptsPerStone.median === null
          ? notCollected()
          : pc.bold(String(metrics.attemptsPerStone.median)),
        metrics.attemptsPerStone.samples === 0
          ? pc.dim("no stone has been run yet")
          : pc.dim(
              `median of ${metrics.attemptsPerStone.samples} · ${spread(metrics.attemptsPerStone.distribution)}`,
            ),
      ],
      [
        "tokens per proven stone",
        metrics.tokensPerProvenStone.median === null
          ? notCollected()
          : pc.bold(String(metrics.tokensPerProvenStone.median)),
        metrics.tokensPerProvenStone.collected
          ? pc.dim(`median of ${metrics.tokensPerProvenStone.samples} proven stone(s)`)
          : pc.dim("nothing records tokens yet"),
      ],
      [
        "flaky rate",
        percent(metrics.flakyRate),
        over(metrics.flakyRate, "stone with ≥2 runs", "stones with ≥2 runs"),
      ],
      [
        "review time per stone",
        notCollected(),
        pc.dim("desktop instrumentation pending — never estimated"),
      ],
      [
        "proof edited share",
        percent(metrics.proofEditedShare),
        over(metrics.proofEditedShare, "comparable attempt", "comparable attempts"),
      ],
    ],
  );
  for (const line of table) io.out(line);

  return EXIT.OK;
}

/* ------------------------------------------------------------- the numbers */

function measure(file: StoneFile, events: RunEvent[], skipped: number): StoneMetrics {
  const runs = runAttempts(events).length;
  const fromLedger = attemptsFrom(events);

  // `cairn amend` copies the old stone's provenance into the new draft, so
  // an amending stone's provenance counts attempts that are not its own and
  // are already counted on the stone it supersedes. Only its ledger speaks.
  const inherited = file.stone.amends !== null;
  const fromProvenance = inherited ? undefined : file.stone.provenance.attempts;

  const attempts = fromLedger > 0 ? fromLedger : (fromProvenance ?? 0);
  const attemptsSource =
    fromLedger > 0 ? "ledger" : fromProvenance !== undefined && fromProvenance > 0 ? "provenance" : "none";

  const ledgerTokens = tokensFrom(events);
  const tokens = ledgerTokens ?? (inherited ? null : (file.stone.provenance.tokens ?? null));

  return {
    file,
    events,
    skipped,
    runs,
    attempts,
    attemptsSource,
    tokens,
    escalated: hasEscalated(events) || file.stone.status === "escalated",
    flaky: flakyFlips(events).length > 0,
  };
}

/** The headline. See DEFINITIONS.provenWithoutHuman for the denominator. */
function provenWithoutHuman(rows: readonly StoneMetrics[]) {
  const decided = rows.filter((row) => {
    const { status } = row.file.stone;
    // A retired stone counts only when it was escalated on the way out: the
    // human was called, and that is exactly what this metric measures. A
    // stone retired by a plain amendment is carried by its successor.
    if (status === "retired") return row.escalated;
    if (status === "proven" || status === "broken" || status === "escalated") return true;
    return row.runs > 0;
  });

  const clean = decided.filter((row) => row.file.stone.status === "proven" && !row.escalated);
  return { collected: decided.length > 0, ...rounded(share(clean.length, decided.length)) };
}

function attemptsPerStone(rows: readonly StoneMetrics[]) {
  const sample = rows.filter((row) => row.attempts > 0);
  const values = sample.map((row) => row.attempts);

  return {
    collected: values.length > 0,
    median: median(values),
    min: values.length > 0 ? Math.min(...values) : null,
    max: values.length > 0 ? Math.max(...values) : null,
    samples: values.length,
    /** Stones whose count came from provenance because runs/ was not there. */
    fromProvenance: sample.filter((row) => row.attemptsSource === "provenance").length,
    distribution: distribution(values),
  };
}

function tokensPerProvenStone(rows: readonly StoneMetrics[]) {
  const proven = rows.filter((row) => row.file.stone.status === "proven");
  const values = proven
    .map((row) => row.tokens)
    .filter((tokens): tokens is number => tokens !== null);

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    collected: values.length > 0,
    median: median(values),
    mean: values.length > 0 ? Math.round(total / values.length) : null,
    total: values.length > 0 ? total : null,
    samples: values.length,
    provenStones: proven.length,
  };
}

function flakyRate(rows: readonly StoneMetrics[]) {
  const repeated = rows.filter((row) => row.runs >= 2);
  const flaky = repeated.filter((row) => row.flaky);
  return {
    collected: repeated.length > 0,
    ...rounded(share(flaky.length, repeated.length)),
    stones: flaky.map((row) => ({
      id: row.file.stone.id,
      flips: flakyFlips(row.events),
    })),
  };
}

function proofEdited(rows: readonly StoneMetrics[]) {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const stoneShare = proofEditedShare(row.events);
    numerator += stoneShare.numerator;
    denominator += stoneShare.denominator;
  }
  return { collected: denominator > 0, ...rounded(share(numerator, denominator)) };
}

/** Rates are reported to four decimals: enough for a percent, no false precision. */
function rounded(value: Share): Share {
  return value.rate === null ? value : { ...value, rate: Math.round(value.rate * 10_000) / 10_000 };
}

/* -------------------------------------------------------------- rendering */

function notCollected(): string {
  return pc.dim("—");
}

function percent(value: Share): string {
  return value.rate === null ? notCollected() : pc.bold(`${Math.round(value.rate * 100)}%`);
}

function over(value: Share, one: string, many: string): string {
  if (value.rate === null) return pc.dim(`no ${many} yet`);
  return pc.dim(`${value.numerator} / ${value.denominator} ${value.denominator === 1 ? one : many}`);
}

/** `1×4 2×3` — how many stones landed on each attempt count. */
function spread(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([value, count]) => `${value}×${count}`)
    .join(" ");
}
