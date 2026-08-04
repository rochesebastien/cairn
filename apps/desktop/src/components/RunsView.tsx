import { useEffect, useRef, useState } from "react";
import type { CairnSnapshot } from "../lib/cairn.js";
import { useAppState } from "../lib/app-state.js";
import { formatDuration } from "../lib/format.js";
import { Empty, ViewHeader } from "./bits.js";

/** Live `cairn verify` output. Mono, autoscrolling, with a follow toggle. */
export function RunsView({ snapshot }: { snapshot: CairnSnapshot | undefined }): JSX.Element {
  const { verify } = useAppState();
  const [follow, setFollow] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow) return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [follow, verify.lines]);

  const subtitle = verify.running
    ? (verify.command ?? "starting the runner…")
    : verify.outcome
      ? `exit ${verify.outcome.code} · ${formatDuration(verify.outcome.durationMs)}`
      : snapshot
        ? `${snapshot.config?.baseURL ?? "no baseURL in config"} · runner: pnpm exec playwright test`
        : "no repository open";

  return (
    <>
      <ViewHeader
        title="Runs"
        subtitle={subtitle}
        tools={
          <>
            <button
              type="button"
              className={`toggle ${follow ? "on" : ""}`}
              onClick={() => {
                setFollow((current) => !current);
              }}
              aria-pressed={follow}
            >
              <span className="knob" />
              follow
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={verify.clear}
              disabled={verify.lines.length === 0 || verify.running}
            >
              clear
            </button>
            <button
              type="button"
              className="btn btn-small btn-accent"
              onClick={() => {
                void verify.run();
              }}
              disabled={verify.running}
            >
              {verify.running ? "verifying…" : "Verify"}
            </button>
          </>
        }
      />
      {verify.running ? <div className="progress-hairline" /> : null}
      <div className="view-body">
        {verify.lines.length === 0 ? (
          <Empty
            title="No run yet"
            hint="Verify replays the proofs with Playwright. No model is involved: the proof is an artifact."
          />
        ) : (
          <div className="run-log" ref={logRef}>
            <pre className="mono">
              {verify.lines.map((line) => (
                <div
                  key={line.id}
                  className={
                    line.kind === "green"
                      ? "run-line-green"
                      : line.kind === "red"
                        ? "run-line-red"
                        : line.kind === "plain"
                          ? ""
                          : "run-line-dim"
                  }
                >
                  {line.text || " "}
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}
