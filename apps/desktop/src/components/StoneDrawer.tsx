import { useEffect } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import type { CairnSnapshot, StoneRecord } from "../lib/cairn.js";
import { lineageOf, runHistory } from "../lib/cairn.js";
import { useProof } from "../lib/app-state.js";
import { isTauri } from "../lib/tauri.js";
import { absoluteTime, formatDuration, relativeTime, shortId } from "../lib/format.js";
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
      <button type="button" className="detail-backdrop" aria-label="Close the stone" onClick={onClose} />
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
              raised {relativeTime(stone.createdAt)}
              {stone.lastGreen ? ` · last green ${relativeTime(stone.lastGreen.at)}` : " · never green"}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon className="nav-icon" />
          </button>
        </header>

        <div className="drawer-body">
          {record.body ? (
            <section className="drawer-section">
              <p className="section-label">intent</p>
              <p style={{ margin: 0, color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>{record.body}</p>
            </section>
          ) : null}

          <section className="drawer-section">
            <p className="section-label">acceptance</p>
            {stone.acceptance.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No criteria on this stone.
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
            <p className="section-label">provenance</p>
            <p className="provenance-body" style={{ margin: 0 }}>
              {stone.provenance.request}
            </p>
            <p className="view-subtitle" style={{ marginTop: 8 }}>
              {stone.provenance.attempts !== undefined
                ? `${stone.provenance.attempts} attempt${stone.provenance.attempts === 1 ? "" : "s"}`
                : "attempts not recorded"}
              {stone.provenance.tokens !== undefined
                ? ` · ${stone.provenance.tokens.toLocaleString("en-US")} tokens`
                : ""}
            </p>
          </section>

          {ancestors.length > 0 ? (
            <section className="drawer-section">
              <p className="section-label">lineage</p>
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
                    <span className="stone-status">{ancestor.stone.status}</span>
                    <span className="id-mono">{shortId(ancestor.stone.id)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="drawer-section">
            <p className="section-label">proof</p>
            {stone.proof ? (
              <>
                <div className="proof-path">
                  <span>{stone.proof}</span>
                  <span>
                    {stone.lastGreen?.proofHash ? `sha256 ${stone.lastGreen.proofHash.slice(0, 12)}` : "never hashed"}
                  </span>
                </div>
                <div className="proof-view">
                  <pre className="mono">
                    {proof.isPending
                      ? "reading…"
                      : proof.isError
                        ? `Cannot read the proof: ${(proof.error as Error).message}`
                        : proof.data}
                  </pre>
                </div>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No proof yet — cairn-warden writes it once the stone is approved.
              </p>
            )}
          </section>

          <section className="drawer-section">
            <p className="section-label">run history</p>
            {runs.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No run recorded for this stone.
              </p>
            ) : (
              <div>
                {runs.map((run) => (
                  <div className="run-row" key={run.id}>
                    <StatusMark status={run.verdict === "green" ? "proven" : "broken"} />
                    <span className="run-verdict">{run.verdict === "green" ? "pass" : "fail"}</span>
                    <span className="run-when">{absoluteTime(run.at)}</span>
                    {run.commit ? <span className="whisper">{run.commit}</span> : null}
                    <span>{run.derived ? "from lastGreen" : formatDuration(run.durationMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {report || lastRed ? (
            <section className="drawer-section">
              <p className="section-label">last failure</p>
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
                      <img className="trace-shot" src={report.screenshot} alt="Playwright screenshot of the failure" />
                    ) : null}
                    {report.trace ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        style={{ marginTop: 10 }}
                        onClick={() => {
                          if (isTauri()) void openExternal(`${snapshot.root}/${report.trace}`);
                        }}
                        title={isTauri() ? "open the trace with the system handler" : "available in the desktop build"}
                      >
                        <ExternalIcon className="nav-icon" />
                        open trace
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p style={{ margin: 0, color: "var(--text-dim)" }}>
                    Red on {absoluteTime(lastRed?.at ?? "")} — no warden report was stored. The run log holds the
                    Playwright output.
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
