import { useState } from "react";
import type { CairnSnapshot, FailureReport, StoneRecord } from "../lib/cairn.js";
import { absoluteTime, relativeTime, shortId } from "../lib/format.js";
import { useLocale, useT, type TranslateFn } from "../lib/i18n.js";
import { Empty, StatusLabel, StatusMark, SurfaceTag, ViewHeader } from "./bits.js";

type Action = "send back" | "amend" | "retire";

/** The three honest choices: their button label, and what each will call once wired. */
const ACTIONS: { id: Action; labelKey: string; wiringKey: string }[] = [
  { id: "send back", labelKey: "escalations.sendBack", wiringKey: "escalations.wiringSendBack" },
  { id: "amend", labelKey: "escalations.amend", wiringKey: "escalations.wiringAmend" },
  { id: "retire", labelKey: "escalations.retire", wiringKey: "escalations.wiringRetire" },
];

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
  const t = useT();
  const locale = useLocale();
  const escalated = snapshot.stones.filter((record) => record.stone.status === "escalated");

  return (
    <>
      <ViewHeader
        title={t("escalations.title")}
        subtitle={
          escalated.length === 0
            ? t("escalations.subtitleEmpty")
            : t("escalations.subtitle", { count: escalated.length })
        }
      />
      <div className="view-body">
        {escalated.length === 0 ? (
          <Empty title={t("escalations.empty")} hint={t("escalations.emptyHint")} />
        ) : (
          escalated.map((record) => (
            <EscalationCard
              key={record.stone.id}
              record={record}
              t={t}
              locale={locale}
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
  t,
  locale,
  report,
  onOpen,
}: {
  record: StoneRecord;
  t: TranslateFn;
  locale: string;
  report: FailureReport | undefined;
  onOpen: (id: string) => void;
}): JSX.Element {
  const { stone } = record;
  const [chosen, setChosen] = useState<(typeof ACTIONS)[number] | null>(null);

  return (
    <article className="escalation-card">
      <div className="review-head">
        <StatusMark status={stone.status} />
        <StatusLabel status={stone.status} />
        <span className="dot-sep">·</span>
        <span className="id-mono">{shortId(stone.id)}</span>
        <SurfaceTag surface={stone.surface} />
        <span className="dot-sep">·</span>
        <span>
          {t("escalations.attempts", { count: stone.provenance.attempts ?? 3 })}
          {" · "}
          {t("review.raised", { when: relativeTime(stone.createdAt, locale) })}
        </span>
      </div>

      <h2 className="review-title">{stone.title}</h2>
      {record.body ? <p className="review-intent">{record.body}</p> : null}

      <p className="section-label" style={{ marginTop: 18 }}>
        {t("escalations.wardenReport")}
      </p>
      {report ? (
        <div className="report-grid">
          <span className="report-key">{t("escalations.verdict")}</span>
          <span className="report-value">{report.summary}</span>
          <span className="report-key">{t("escalations.expected")}</span>
          <span className="report-value">{report.expected}</span>
          <span className="report-key">{t("escalations.actual")}</span>
          <span className="report-value">{report.actual}</span>
          {report.step ? (
            <>
              <span className="report-key">{t("escalations.failedAt")}</span>
              <span className="report-value mono">{report.step}</span>
            </>
          ) : null}
          {report.trace ? (
            <>
              <span className="report-key">{t("escalations.trace")}</span>
              <span className="report-value mono">{report.trace}</span>
            </>
          ) : null}
          <span className="report-key">{t("escalations.when")}</span>
          {/* a record timestamp, not prose: ISO in every language */}
          <span className="report-value mono">{absoluteTime(report.at)}</span>
        </div>
      ) : (
        <p className="muted" style={{ maxWidth: "68ch" }}>
          {t("escalations.noReport")}
        </p>
      )}

      {report?.diff ? <Diff text={report.diff} /> : null}

      <div className="review-actions">
        {ACTIONS.map((action, index) => (
          <button
            key={action.id}
            type="button"
            className={`btn ${index === 0 ? "btn-accent" : "btn-ghost"}`}
            onClick={() => {
              setChosen(action);
            }}
          >
            {t(action.labelKey)}
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
          {t("review.open")}
        </button>
      </div>
      {chosen ? (
        <p className="pending-note" style={{ marginTop: 12 }}>
          {t("escalations.notWired", { action: t(chosen.labelKey), call: t(chosen.wiringKey) })}
        </p>
      ) : null}
    </article>
  );
}

/** A unified diff. No hues: the +/- column plus a contrast step carries it. */
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
