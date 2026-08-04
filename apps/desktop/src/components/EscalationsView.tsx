import { useState } from "react";
import type { CairnSnapshot, FailureReport, StoneRecord } from "../lib/cairn.js";
import { absoluteTime, relativeTime, shortId } from "../lib/format.js";
import { Empty, StatusDot, SurfaceTag, ViewHeader } from "./bits.js";

/** What an escalation action would do once it is wired to the MCP server. */
const WIRING: Record<string, string> = {
  "send back": "record_run + a fresh coder attempt (the budget resets to 3)",
  amend: "amend_stone — the old stone retires, the new one starts as a draft",
  retire: "retire_stone — the stone leaves the suite and stops being verified",
};

/**
 * Escalations: the coder/warden loop spent its budget. A human decides, and
 * the screen gives exactly three honest choices.
 */
export function EscalationsView({
  snapshot,
  onOpen,
}: {
  snapshot: CairnSnapshot;
  onOpen: (id: string) => void;
}): JSX.Element {
  const escalated = snapshot.stones.filter((record) => record.stone.status === "escalated");

  return (
    <>
      <ViewHeader
        title="Escalations"
        subtitle={
          escalated.length === 0
            ? "no stone is waiting on a human"
            : `${escalated.length} stone${escalated.length === 1 ? "" : "s"} out of attempts`
        }
      />
      <div className="view-body">
        {escalated.length === 0 ? (
          <Empty
            title="Nothing escalated"
            hint="A stone lands here when the coder/warden loop burns its three attempts. Its only exits are amend and retire."
          />
        ) : (
          escalated.map((record) => (
            <EscalationCard
              key={record.stone.id}
              record={record}
              report={snapshot.reports[record.stone.id]}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </>
  );
}

function EscalationCard({
  record,
  report,
  onOpen,
}: {
  record: StoneRecord;
  report: FailureReport | undefined;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { stone } = record;
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <article className="escalation-card">
      <div className="review-head">
        <StatusDot status={stone.status} />
        <span className="id-mono">{shortId(stone.id)}</span>
        <SurfaceTag surface={stone.surface} />
        <span className="dot-sep">·</span>
        <span>
          {stone.provenance.attempts ?? 3} attempts spent · raised {relativeTime(stone.createdAt)}
        </span>
      </div>

      <h2 className="review-title">{stone.title}</h2>
      {record.body ? <p className="review-intent">{record.body}</p> : null}

      <p className="section-label" style={{ marginTop: 18 }}>
        warden report
      </p>
      {report ? (
        <div className="report-grid">
          <span className="report-key">verdict</span>
          <span className="report-value">{report.summary}</span>
          <span className="report-key">expected</span>
          <span className="report-value">{report.expected}</span>
          <span className="report-key">actual</span>
          <span className="report-value">{report.actual}</span>
          {report.step ? (
            <>
              <span className="report-key">failed at</span>
              <span className="report-value mono">{report.step}</span>
            </>
          ) : null}
          {report.trace ? (
            <>
              <span className="report-key">trace</span>
              <span className="report-value mono">{report.trace}</span>
            </>
          ) : null}
          <span className="report-key">when</span>
          <span className="report-value mono">{absoluteTime(report.at)}</span>
        </div>
      ) : (
        <p className="muted" style={{ maxWidth: "68ch" }}>
          No report was written for this stone. Phase 1 records the attempt count in provenance and nothing
          else — open the stone to read its last failure from the run log.
        </p>
      )}

      {report?.diff ? <Diff text={report.diff} /> : null}

      <div className="review-actions">
        {(["send back", "amend", "retire"] as const).map((action, index) => (
          <button
            key={action}
            type="button"
            className={`btn ${index === 0 ? "btn-accent" : "btn-ghost"}`}
            onClick={() => {
              setChosen(action);
            }}
          >
            {action === "send back" ? "Send back to coder" : action === "amend" ? "Amend" : "Retire"}
          </button>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={() => {
            onOpen(stone.id);
          }}
        >
          open
        </button>
      </div>
      {chosen ? (
        <p className="pending-note" style={{ marginTop: 12 }}>
          “{chosen}” is not wired yet. It will call {WIRING[chosen]}.
        </p>
      ) : null}
    </article>
  );
}

/** A unified diff, coloured with the status hues at text scale only. */
function Diff({ text }: { text: string }): JSX.Element {
  return (
    <div className="diff-block">
      <pre className="mono">
        {text.split("\n").map((line, index) => {
          const kind =
            line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")
              ? "diff-meta"
              : line.startsWith("+")
                ? "diff-add"
                : line.startsWith("-")
                  ? "diff-del"
                  : "";
          return (
            <div key={`${index}-${line}`} className={kind}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
