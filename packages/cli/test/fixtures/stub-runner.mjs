#!/usr/bin/env node
/**
 * A stand-in for `playwright test`, so the CLI tests never need a browser.
 *
 * It speaks the same protocol Cairn relies on: it receives spec paths as
 * arguments and writes a Playwright-shaped JSON report to the file named by
 * PLAYWRIGHT_JSON_OUTPUT_NAME.
 *
 * Control it with:
 *   CAIRN_STUB_RESULTS  JSON map of spec basename (or "*") to
 *                       "passed" | "failed" | "skipped" | "absent"
 *   CAIRN_STUB_MODE     "crash" to fail before running anything
 *   CAIRN_STUB_LOG      file to append the received argv to
 */
import { appendFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const specs = args.filter((arg) => !arg.startsWith("-"));
const reportPath = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME;

if (process.env.CAIRN_STUB_LOG) {
  appendFileSync(process.env.CAIRN_STUB_LOG, `${JSON.stringify(args)}\n`, "utf8");
}

if (process.env.CAIRN_STUB_MODE === "crash") {
  if (reportPath) {
    writeFileSync(
      reportPath,
      JSON.stringify({ config: {}, suites: [], errors: [{ message: "no tests found" }] }),
      "utf8",
    );
  }
  process.stderr.write("stub runner: exploded on purpose\n");
  process.exit(1);
}

const results = JSON.parse(process.env.CAIRN_STUB_RESULTS ?? "{}");
const outcomeFor = (spec) => {
  const base = spec.split("/").pop();
  return results[base] ?? results[spec] ?? results["*"] ?? "passed";
};

const suites = [];
let failed = 0;

for (const spec of specs) {
  const outcome = outcomeFor(spec);
  if (outcome === "absent") continue;
  if (outcome === "failed") failed += 1;

  const status =
    outcome === "failed" ? "unexpected" : outcome === "skipped" ? "skipped" : "expected";

  suites.push({
    title: spec,
    file: spec,
    specs: [
      {
        title: `proof for ${spec}`,
        ok: outcome !== "failed",
        file: spec,
        tests: [
          {
            status,
            results: [
              { status: outcome === "failed" ? "failed" : outcome === "skipped" ? "skipped" : "passed" },
            ],
          },
        ],
      },
    ],
  });
}

const report = {
  config: { rootDir: process.cwd() },
  suites,
  errors: [],
  stats: { expected: specs.length - failed, unexpected: failed, skipped: 0 },
};

if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
else process.stdout.write(JSON.stringify(report));

process.exit(failed > 0 ? 1 : 0);
