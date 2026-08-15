import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { StoneRecord } from "../lib/cairn.js";
import { useAppState, type Decision } from "../lib/app-state.js";
import { relativeTime, shortId } from "../lib/format.js";
import { useLocale, useT, useTNode, type TranslateFn } from "../lib/i18n.js";
import { Empty, Kbd, StatusLabel, StatusMark, SurfaceTag, ViewHeader } from "./bits.js";

const DECISION_KEY: Record<Decision, string> = {
  approved: "review.decisionApproved",
  rephrase: "review.decisionRephrase",
  rejected: "review.decisionRejected",
};

/**
 * The home screen, and the reason the app exists: does this stone describe
 * what I wanted? Reading first — actions come after the words.
 */
export function ReviewView({
  drafts,
  onOpen,
  drawerOpen,
}: {
  drafts: StoneRecord[];
  onOpen: (id: string) => void;
  drawerOpen: boolean;
}): JSX.Element {
  const t = useT();
  const tn = useTNode();
  const locale = useLocale();
  const { decisions, decide, undecide } = useAppState();
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const pending = useMemo(
    () => drafts.filter((record) => decisions[record.stone.id] === undefined),
    [drafts, decisions],
  );

  useEffect(() => {
    if (cursor > drafts.length - 1) setCursor(Math.max(0, drafts.length - 1));
  }, [cursor, drafts.length]);

  useEffect(() => {
    if (drawerOpen) return;
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (drafts.length === 0) return;

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((current) => Math.min(current + 1, drafts.length - 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((current) => Math.max(current - 1, 0));
      } else if (event.key === "a") {
        const record = drafts[cursor];
        if (record) {
          event.preventDefault();
          decide(record.stone.id, "approved");
          setCursor((current) => Math.min(current + 1, drafts.length - 1));
        }
      } else if (event.key === "Enter") {
        const record = drafts[cursor];
        if (record) {
          event.preventDefault();
          onOpen(record.stone.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [cursor, decide, drafts, drawerOpen, onOpen]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(".review-card.selected");
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const decided = drafts.length - pending.length;

  return (
    <>
      <ViewHeader
        title={t("review.title")}
        subtitle={
          drafts.length === 0
            ? t("review.subtitleEmpty")
            : t("review.subtitle", { done: pending.length, total: drafts.length })
        }
      />
      <div className="view-body" ref={listRef}>
        {decided > 0 ? (
          <p className="pending-note">
            {tn("review.sessionNote", {
              count: decided,
              /* MCP tool names — an API surface, not prose */
              createDraft: <span className="mono">create_draft</span>,
              amendStone: <span className="mono">amend_stone</span>,
            })}
          </p>
        ) : null}

        {drafts.length === 0 ? (
          <Empty title={t("review.empty")} hint={t("review.emptyHint")} />
        ) : (
          <div className="review-view">
            {drafts.map((record, index) => (
              <ReviewCard
                key={record.stone.id}
                record={record}
                t={t}
                locale={locale}
                selected={index === cursor}
                decision={decisions[record.stone.id]}
                onSelect={() => {
                  setCursor(index);
                }}
                onDecide={(decision) => {
                  decide(record.stone.id, decision);
                }}
                onUndo={() => {
                  undecide(record.stone.id);
                }}
                onOpen={() => {
                  onOpen(record.stone.id);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {/* key caps, not words: they name the physical key in every language */}
      <footer className="view-foot">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd>
        <span>{t("review.kbdMove")}</span>
        <span className="dot-sep">·</span>
        <Kbd>a</Kbd>
        <span>{t("review.kbdApprove")}</span>
        <span className="dot-sep">·</span>
        <Kbd>↵</Kbd>
        <span>{t("review.kbdOpen")}</span>
        <span className="dot-sep">·</span>
        <Kbd>esc</Kbd>
        <span>{t("review.kbdClose")}</span>
      </footer>
    </>
  );
}

function ReviewCard({
  record,
  t,
  locale,
  selected,
  decision,
  onSelect,
  onDecide,
  onUndo,
  onOpen,
}: {
  record: StoneRecord;
  t: TranslateFn;
  locale: string;
  selected: boolean;
  decision: Decision | undefined;
  onSelect: () => void;
  onDecide: (decision: Decision) => void;
  onUndo: () => void;
  onOpen: () => void;
}): JSX.Element {
  const { stone, body } = record;
  return (
    <article
      className={`review-card ${selected ? "selected" : ""}`}
      onMouseDown={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <div className="review-head">
        <StatusMark status={stone.status} />
        <StatusLabel status={stone.status} />
        <span className="dot-sep">·</span>
        <span className="id-mono">{shortId(stone.id)}</span>
        <SurfaceTag surface={stone.surface} />
        <span className="dot-sep">·</span>
        <span>{t("review.raised", { when: relativeTime(stone.createdAt, locale) })}</span>
      </div>

      <h2 className="review-title">{stone.title}</h2>
      {body ? <p className="review-intent">{body}</p> : null}

      {stone.acceptance.length > 0 ? (
        <>
          <ul className="acceptance" style={{ marginTop: 16 }}>
            {stone.acceptance.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 12 }}>
          {t("review.noAcceptance")}
        </p>
      )}

      <details className="provenance">
        <summary>{t("review.provenance")}</summary>
        <p className="provenance-body">{stone.provenance.request}</p>
      </details>

      <div className="review-actions">
        {decision ? (
          <>
            <span className="decision">
              <StatusMark status={decision === "approved" ? "proven" : "draft"} />
              {t("review.decisionNote", { decision: t(DECISION_KEY[decision]) })}
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-small" onClick={onUndo}>
              {t("review.undo")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => {
                onDecide("approved");
              }}
            >
              {t("review.approve")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onDecide("rephrase");
              }}
            >
              {t("review.rephrase")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onDecide("rejected");
              }}
            >
              {t("review.reject")}
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-small" onClick={onOpen}>
              {t("review.open")}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
