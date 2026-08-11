import { useEffect } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import type { CairnSnapshot, StoneRecord } from "../lib/cairn.js";
import { lineageOf, runHistory } from "../lib/cairn.js";
import { useProof } from "../lib/app-state.js";
import { isTauri } from "../lib/tauri.js";
import { absoluteTime, formatDuration, relativeTime, shortId } from "../lib/format.js";
import { useLocale, useT } from "../lib/i18n.js";
import { ExternalIcon, CloseIcon } from "./icons.js";
import { StatusChip, StatusMark, SurfaceTag } from "./bits.js";

/**
 * The stone, in reading order: intent, acceptance, provenance, proof, runs,
 * last failure. The proof is shown, never edited — the warden owns it.
 */
export function StoneDrawer({
  record,
  snapshot,
  onClose,
  onOpen,
}: {
  record: StoneRecord;
  snapshot: CairnSnapshot;
  onClose: () => void;
  onOpen: (id: string) => void;
}): JSX.Element {
  const t = useT();
  const locale = useLocale();
  const { stone } = record;
  const proof = useProof(snapshot.root, stone.proof);
  const ancestors = lineageOf(snapshot.stones, stone.id);
  const runs = runHistory(snapshot, stone);
  const report = snapshot.reports[stone.id];
  const lastRed = runs.find((run) => run.verdict === "red");

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <>
      <button type="button" className="detail-backdrop" aria-label={t("drawer.closeStone")} onClick={onClose} />
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={stone.title}>
        <header className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <StatusChip status={stone.status} />
              <SurfaceTag surface={stone.surface} />
              <span className="id-mono">{stone.id}</span>
            </div>
            <h2 className="drawer-title">{stone.title}</h2>
            <p className="view-subtitle">
              {stone.lastGreen
                ? t("drawer.raisedGreen", {
                    raised: relativeTime(stone.createdAt, locale),
                    green: relativeTime(stone.lastGreen.at, locale),
                  })
                : `${t("drawer.raised", { raised: relativeTime(stone.createdAt, locale) })} · ${t("drawer.neverGreen")}`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("drawer.close")}>
            <CloseIcon className="nav-icon" />
          </button>
        </header>

        <div className="drawer-body">
          {record.body ? (
            <section className="drawer-section">
              <p className="section-label">{t("drawer.intent")}</p>
              <p style={{ margin: 0, color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{record.body}</p>
            </section>
          ) : null}

          <section className="drawer-section">
            <p className="section-label">{t("drawer.acceptance")}</p>
            {stone.acceptance.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t("drawer.noAcceptance")}
              </p>
            ) : (
              <ul className="acceptance" style={{ margin: 0 }}>
                {stone.acceptance.map((criterion) => (
                  <li key={criterion}>{criterion}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="drawer-section">
            <p className="section-label">{t("drawer.provenance")}</p>
            <p className="provenance-body" style={{ margin: 0 }}>
              {stone.provenance.request}
            </p>
            <p className="view-subtitle" style={{ marginTop: 8 }}>
              {stone.provenance.attempts === undefined
                ? t("drawer.noAttempts")
                : stone.provenance.tokens === undefined
                  ? t("drawer.attempts", { attempts: stone.provenance.attempts })
                  : t("drawer.attemptsTokens", {
                      attempts: stone.provenance.attempts,
                      tokens: stone.provenance.tokens.toLocaleString(locale),
                    })}
            </p>
          </section>

          {ancestors.length > 0 ? (
            <section className="drawer-section">
              <p className="section-label">{t("drawer.lineage")}</p>
              <div className="lineage" style={{ marginLeft: 0 }}>
                {ancestors.map((ancestor) => (
                  <button
                    key={ancestor.stone.id}
                    type="button"
                    className={`stone-item is-${ancestor.stone.status}`}
                    onClick={() => {
                      onOpen(ancestor.stone.id);
                    }}
                  >
                    <StatusMark status={ancestor.stone.status} />
                    <span className="stone-title">{ancestor.stone.title}</span>
                    {/* a status is a value in .cairn/ — verbatim in every language */}
                    <span className="stone-status">{ancestor.stone.status}</span>
                    <span className="id-mono">{shortId(ancestor.stone.id)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="drawer-section">
            <p className="section-label">{t("drawer.proof")}</p>
            {stone.proof ? (
              <>
                <div className="proof-path">
                  {/* the proof's path and its hash are record: never translated */}
                  <span>{stone.proof}</span>
                  <span>
                    {stone.lastGreen?.proofHash
                      ? `sha256 ${stone.lastGreen.proofHash.slice(0, 12)}`
                      : t("drawer.neverHashed")}
                  </span>
                </div>
                <div className="proof-view">
                  <pre className="mono">
                    {proof.isPending
                      ? t("drawer.reading")
                      : proof.isError
                        ? t("drawer.cannotReadProof", { message: (proof.error as Error).message })
                        : proof.data}
                  </pre>
                </div>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                {t("drawer.noProof")} · {t("drawer.noProofHint")}
              </p>
            )}
          </section>

          <section className="drawer-section">
            <p className="section-label">{t("drawer.runs")}</p>
            {runs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {t("drawer.noRuns")}
              </p>
            ) : (
              <div>
                {runs.map((run) => (
                  <div className="run-row" key={run.id}>
                    <StatusMark status={run.verdict === "green" ? "proven" : "broken"} />
                    <span className="run-verdict">{t(run.verdict === "green" ? "drawer.pass" : "drawer.fail")}</span>
                    {/* a run timestamp and its commit sha are record: verbatim */}
                    <span className="run-when">{absoluteTime(run.at)}</span>
                    {run.commit ? <span className="whisper">{run.commit}</span> : null}
                    <span>{run.derived ? t("drawer.fromLastGreen") : formatDuration(run.durationMs, locale)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {report || lastRed ? (
            <section className="drawer-section">
              <p className="section-label">{t("drawer.failure")}</p>
              <div className="failure-block">
                {report ? (
                  <>
                    <p style={{ margin: 0, color: "var(--text-dim)" }}>{report.summary}</p>
                    {report.step ? (
                      <pre className="mono" style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-faint)" }}>
                        {report.step}
                      </pre>
                    ) : null}
                    {report.screenshot ? (
                      <img className="trace-shot" src={report.screenshot} alt={t("drawer.shotAlt")} />
                    ) : null}
                    {report.trace ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        style={{ marginTop: 10 }}
                        onClick={() => {
                          if (isTauri()) void openExternal(`${snapshot.root}/${report.trace}`);
                        }}
                        title={t(isTauri() ? "drawer.openTraceTitle" : "drawer.desktopOnly")}
                      >
                        <ExternalIcon className="nav-icon" />
                        {t("drawer.openTrace")}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p style={{ margin: 0, color: "var(--text-dim)" }}>
                    {t("drawer.redNoReport", { when: absoluteTime(lastRed?.at ?? "") })}
                  </p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
