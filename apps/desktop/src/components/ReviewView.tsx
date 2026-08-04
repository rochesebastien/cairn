import { useEffect, useMemo, useRef, useState } from "react";
import type { StoneRecord } from "../lib/cairn.js";
import { useAppState, type Decision } from "../lib/app-state.js";
import { relativeTime, shortId } from "../lib/format.js";
import { Empty, Kbd, StatusLabel, StatusMark, SurfaceTag, ViewHeader } from "./bits.js";

const DECISION_LABEL: Record<Decision, string> = {
  approved: "approved",
  rephrase: "sent back for rephrasing",
  rejected: "rejected",
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
        title="Review"
        subtitle={
          drafts.length === 0
            ? "nothing waiting — the mason has raised no new stones"
            : `${pending.length} of ${drafts.length} draft${drafts.length === 1 ? "" : "s"} still to read`
        }
      />
      <div className="view-body" ref={listRef}>
        {decided > 0 ? (
          <p className="pending-note">
            {decided} decision{decided === 1 ? "" : "s"} recorded in this session only. Writing them back to the
            cairn needs the MCP wiring (<span className="mono">create_draft</span> /{" "}
            <span className="mono">amend_stone</span>) — the stones below are still drafts on disk.
          </p>
        ) : null}

        {drafts.length === 0 ? (
          <Empty
            title="No drafts to review"
            hint="cairn-mason writes drafts into .cairn/stones as it extracts intents. They appear here."
          />
        ) : (
          <div className="review-view">
            {drafts.map((record, index) => (
              <ReviewCard
                key={record.stone.id}
                record={record}
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
      <footer className="view-foot">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd>
        <span>move</span>
        <span className="dot-sep">·</span>
        <Kbd>a</Kbd>
        <span>approve</span>
        <span className="dot-sep">·</span>
        <Kbd>↵</Kbd>
        <span>open the stone</span>
        <span className="dot-sep">·</span>
        <Kbd>esc</Kbd>
        <span>close</span>
      </footer>
    </>
  );
}

function ReviewCard({
  record,
  selected,
  decision,
  onSelect,
  onDecide,
  onUndo,
  onOpen,
}: {
  record: StoneRecord;
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
        <span>raised {relativeTime(stone.createdAt)}</span>
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
          No acceptance criteria yet.
        </p>
      )}

      <details className="provenance">
        <summary>what was actually asked</summary>
        <p className="provenance-body">{stone.provenance.request}</p>
      </details>

      <div className="review-actions">
        {decision ? (
          <>
            <span className="decision">
              <StatusMark status={decision === "approved" ? "proven" : "draft"} />
              {DECISION_LABEL[decision]} — in this session
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-small" onClick={onUndo}>
              undo
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
              Approve
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onDecide("rephrase");
              }}
            >
              Rephrase
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onDecide("rejected");
              }}
            >
              Reject
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-small" onClick={onOpen}>
              open
            </button>
          </>
        )}
      </div>
    </article>
  );
}
