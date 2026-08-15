import { useEffect, useRef, useState, type JSX } from "react";
import type { CairnSnapshot } from "../lib/cairn.js";
import { useAppState } from "../lib/app-state.js";
import { formatDuration } from "../lib/format.js";
import { useLocale, useT } from "../lib/i18n.js";
import { Empty, ViewHeader } from "./bits.js";

/** Live `cairn verify` output. Mono, autoscrolling, with a follow toggle. */
export function RunsView({ snapshot }: { snapshot: CairnSnapshot | undefined }): JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { verify } = useAppState();
  const [follow, setFollow] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!follow) return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [follow, verify.lines]);

  const subtitle = verify.running
    ? (verify.command ?? t("runs.starting"))
    : verify.outcome
      ? `${t("runs.exit", { code: verify.outcome.code })} · ${formatDuration(verify.outcome.durationMs, locale)}`
      : snapshot
        ? // the command itself is a command, not prose
          `${snapshot.config?.baseURL ?? t("runs.noBaseURL")} · ${t("runs.runner")}: pnpm exec playwright test`
        : t("shell.noRepo");

  return (
    <>
      <ViewHeader
        title={t("runs.title")}
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
              {t("runs.follow")}
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={verify.clear}
              disabled={verify.lines.length === 0 || verify.running}
            >
              {t("runs.clear")}
            </button>
            <button
              type="button"
              className="btn btn-small btn-accent"
              onClick={() => {
                void verify.run();
              }}
              disabled={verify.running}
            >
              {t(verify.running ? "sidebar.verifying" : "runs.verify")}
            </button>
          </>
        }
      />
      {verify.running ? <div className="progress-hairline" /> : null}
      <div className="view-body">
        {verify.lines.length === 0 ? (
          <Empty title={t("runs.noRun")} hint={t("runs.noRunHint")} />
        ) : (
          <div className="run-log" ref={logRef}>
            <pre className="mono">
              {verify.lines.map((line) => (
                <div
                  key={line.id}
                  className={
                    line.kind === "green"
                      ? "run-line-pass"
                      : line.kind === "red"
                        ? "run-line-fail"
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
