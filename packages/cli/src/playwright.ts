import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isMissingExecutable, runArgv, tokenize, type RunResult } from "./proc.js";

/**
 * Running proofs. Cairn never links against Playwright: it spawns the runner
 * the project already has, asks for the JSON reporter written to a temp file,
 * and reads the results back. That keeps `cairn verify` usable from any
 * package manager, and lets tests inject a stub runner.
 */

/** Env var (or `--runner`) that replaces the Playwright command entirely. */
export const RUNNER_ENV = "CAIRN_PLAYWRIGHT_CMD";

/** Candidate runners, tried in order until one is actually spawnable. */
export const DEFAULT_RUNNERS: readonly string[] = [
  "pnpm exec playwright test",
  "npx --no-install playwright test",
];

export type SpecStatus = "passed" | "failed" | "skipped";

export interface ParsedReport {
  /** Result per spec file, keyed by file basename (`<ulid>.spec.ts`). */
  byFile: Map<string, SpecStatus>;
  /** Same results keyed by the POSIX path reported by Playwright. */
  byPath: Map<string, SpecStatus>;
  /** Top-level runner errors (bad config, no tests found, ...). */
  errors: string[];
  /** How many specs the report contained. */
  specCount: number;
}

interface RawTestResult {
  status?: string;
}

interface RawTest {
  status?: string;
  results?: RawTestResult[];
}

interface RawSpec {
  title?: string;
  ok?: boolean;
  file?: string;
  tests?: RawTest[];
}

interface RawSuite {
  title?: string;
  file?: string;
  specs?: RawSpec[];
  suites?: RawSuite[];
}

interface RawReport {
  suites?: RawSuite[];
  errors?: Array<{ message?: string; value?: string } | string>;
}

function toPosix(p: string): string {
  return p.split("\\").join("/");
}

function worse(a: SpecStatus | undefined, b: SpecStatus): SpecStatus {
  const rank: Record<SpecStatus, number> = { failed: 2, passed: 1, skipped: 0 };
  if (!a) return b;
  return rank[b] > rank[a] ? b : a;
}

/**
 * Fold one spec's test results into a single status.
 *
 * Playwright reports two levels: `test.status` is the *outcome*
 * ("expected" | "unexpected" | "flaky" | "skipped") and `results[].status` is
 * one attempt ("passed" | "failed" | "timedOut" | ...). The outcome wins, so a
 * flaky proof that failed once and passed on the retry counts as green — the
 * runner already applied the project's `retries` policy.
 */
function specStatus(spec: RawSpec): SpecStatus {
  if (spec.ok === false) return "failed";

  const outcomes = (spec.tests ?? [])
    .map((test) => test.status)
    .filter((status): status is string => Boolean(status));

  if (outcomes.length > 0) {
    if (outcomes.includes("unexpected")) return "failed";
    if (outcomes.every((status) => status === "skipped")) return "skipped";
    return "passed";
  }

  const attempts = (spec.tests ?? [])
    .flatMap((test) => test.results ?? [])
    .map((result) => result.status)
    .filter((status): status is string => Boolean(status));

  if (attempts.length > 0) {
    if (attempts.some((status) => status === "failed" || status === "timedOut" || status === "interrupted")) {
      return "failed";
    }
    if (attempts.every((status) => status === "skipped")) return "skipped";
    return "passed";
  }

  return spec.ok === true ? "passed" : "skipped";
}

/**
 * Parse a Playwright JSON report into per-file results.
 *
 * Playwright nests suites (file suite → describe suites → specs) and reports
 * `file` on suites and/or specs depending on the version, so both are walked
 * and results are aggregated per file: one failing spec fails the file, which
 * is exactly the granularity a stone needs (one proof file per stone).
 */
export function parsePlaywrightReport(input: unknown): ParsedReport {
  const report = (input ?? {}) as RawReport;
  const byPath = new Map<string, SpecStatus>();
  let specCount = 0;

  const walk = (suite: RawSuite, inheritedFile?: string): void => {
    const suiteFile = suite.file ?? inheritedFile;
    for (const spec of suite.specs ?? []) {
      specCount += 1;
      const file = toPosix(spec.file ?? suiteFile ?? suite.title ?? "");
      if (!file) continue;
      byPath.set(file, worse(byPath.get(file), specStatus(spec)));
    }
    for (const child of suite.suites ?? []) walk(child, suiteFile);
  };

  for (const suite of report.suites ?? []) walk(suite);

  const byFile = new Map<string, SpecStatus>();
  for (const [file, status] of byPath) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    byFile.set(base, worse(byFile.get(base), status));
  }

  const errors = (report.errors ?? [])
    .map((error) => (typeof error === "string" ? error : (error.message ?? error.value ?? "")))
    .filter((message): message is string => Boolean(message));

  return { byFile, byPath, errors, specCount };
}

/**
 * Look a proof up in a parsed report. Proof paths are `<dir>/<ulid>.spec.ts`
 * and ULIDs are unique, so the basename is a safe key whatever `testDir` the
 * project's Playwright config uses.
 */
export function statusForProof(report: ParsedReport, proofPath: string): SpecStatus | undefined {
  const posix = toPosix(proofPath);
  const direct = report.byPath.get(posix);
  if (direct) return direct;
  const base = posix.slice(posix.lastIndexOf("/") + 1);
  return report.byFile.get(base);
}

export interface ProofRunOptions {
  /** Project root; the runner is spawned with this as cwd. */
  root: string;
  /** Proof paths to run, relative to the root (POSIX-shaped). */
  specs: string[];
  /** Explicit runner command line (`--runner`), else env, else defaults. */
  runner?: string;
  retries?: number;
  baseURL?: string;
  /** Config `start`, exported as CAIRN_START for playwright's webServer. */
  start?: string;
  env?: NodeJS.ProcessEnv;
  onOutput?: (chunk: string) => void;
}

export interface ProofRunOutcome {
  /** Parsed JSON report; empty when the runner produced none. */
  report: ParsedReport;
  /** Raw JSON, kept for `--json` output and debugging. */
  raw: unknown;
  run: RunResult;
  /** The command line that actually ran. */
  command: string;
  /** True when no runner could be spawned at all. */
  runnerMissing: boolean;
}

/** The runner command lines to try, most specific first. */
export function resolveRunners(explicit?: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const chosen = explicit ?? env[RUNNER_ENV];
  if (chosen && chosen.trim().length > 0) return [chosen.trim()];
  return [...DEFAULT_RUNNERS];
}

/**
 * Run the given proofs and return their parsed results.
 *
 * The JSON reporter writes to a file in the OS temp dir (never inside the
 * project) via PLAYWRIGHT_JSON_OUTPUT_NAME, so the runner's stdout stays free
 * for human progress output.
 */
export async function runProofs(options: ProofRunOptions): Promise<ProofRunOutcome> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "cairn-verify-"));
  const reportPath = path.join(tempDir, "report.json");

  try {
    const env: NodeJS.ProcessEnv = {
      ...options.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
      PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      // Handy for stub runners and for project-level playwright configs.
      CAIRN_REPORT_PATH: reportPath,
      CAIRN_SPECS: options.specs.join(path.delimiter),
      ...(options.baseURL ? { CAIRN_BASE_URL: options.baseURL, PLAYWRIGHT_BASE_URL: options.baseURL } : {}),
      // The project's playwright.config owns the app lifecycle; Cairn only
      // tells it what the config says to start.
      ...(options.start ? { CAIRN_START: options.start } : {}),
    };

    const args = [
      "--reporter=json",
      ...(options.retries && options.retries > 0 ? [`--retries=${options.retries}`] : []),
      ...options.specs,
    ];

    let last: RunResult | undefined;
    for (const runner of resolveRunners(options.runner)) {
      const [command, ...prefix] = tokenize(runner);
      if (!command) continue;
      const result = await runArgv(command, [...prefix, ...args], {
        cwd: options.root,
        env,
        onStdout: options.onOutput,
        onStderr: options.onOutput,
      });
      last = result;
      if (isMissingExecutable(result)) continue;

      const { raw, report } = await readReport(reportPath, result);
      return { report, raw, run: result, command: `${runner} ${args.join(" ")}`, runnerMissing: false };
    }

    return {
      report: emptyReport(),
      raw: null,
      run:
        last ??
        ({ code: null, signal: null, stdout: "", stderr: "", command: "" } satisfies RunResult),
      command: resolveRunners(options.runner)[0] ?? "",
      runnerMissing: true,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function readReport(
  reportPath: string,
  result: RunResult,
): Promise<{ raw: unknown; report: ParsedReport }> {
  let raw: unknown = null;
  try {
    raw = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    // Some runners print the JSON report on stdout instead of writing the file.
    const start = result.stdout.indexOf("{");
    if (start >= 0) {
      try {
        raw = JSON.parse(result.stdout.slice(start));
      } catch {
        raw = null;
      }
    }
  }
  return { raw, report: raw ? parsePlaywrightReport(raw) : emptyReport() };
}

export function emptyReport(): ParsedReport {
  return { byFile: new Map(), byPath: new Map(), errors: [], specCount: 0 };
}
