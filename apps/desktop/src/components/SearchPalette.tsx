/**
 * Search — one field over a dimmed page, the Raycast shape.
 *
 * It searches the whole cairn, not one view: stone titles, intents, acceptance
 * criteria, the verbatim request, ULIDs, surfaces, statuses — plus the views
 * themselves and the open repositories, so it doubles as a command bar.
 *
 * Opens on ⌘K / Ctrl-K or from the sidebar. Arrow keys move, Enter goes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ViewName } from "./Sidebar.js";
import { useAllCairns, useAppState } from "../lib/app-state.js";
import { repoName, type StoneRecord } from "../lib/cairn.js";
import { StatusMark } from "./bits.js";
import { ArrowTurnIcon, CairnIcon, EscalationIcon, FolderIcon, ReviewIcon, RunsIcon, SearchIcon } from "./icons.js";

type Result =
  | { kind: "stone"; id: string; record: StoneRecord; root: string; where: string }
  | { kind: "view"; id: string; view: ViewName; label: string; hint: string }
  | { kind: "repo"; id: string; root: string };

const VIEWS: { view: ViewName; label: string; hint: string; Icon: (p: { className?: string }) => JSX.Element }[] = [
  { view: "home", label: "Home", hint: "the heatmap", Icon: SearchIcon },
  { view: "review", label: "Review", hint: "drafts waiting to be read", Icon: ReviewIcon },
  { view: "cairn", label: "Cairn", hint: "every stone", Icon: CairnIcon },
  { view: "escalations", label: "Escalations", hint: "out of attempts", Icon: EscalationIcon },
  { view: "runs", label: "Runs", hint: "verify output", Icon: RunsIcon },
];

/** Substring match over everything a stone carries, plus a crude relevance. */
function scoreStone(record: StoneRecord, needle: string): number {
  const { stone, body } = record;
  const title = stone.title.toLowerCase();
  if (title.includes(needle)) return title.startsWith(needle) ? 100 : 80;
  if (stone.id.toLowerCase().includes(needle)) return 70;
  if ((stone.surface ?? "").toLowerCase().includes(needle)) return 60;
  if (stone.status.includes(needle)) return 55;
  if (stone.acceptance.some((line) => line.toLowerCase().includes(needle))) return 40;
  if (stone.provenance.request.toLowerCase().includes(needle)) return 30;
  if (body.toLowerCase().includes(needle)) return 20;
  return 0;
}

export function SearchPalette({
  onClose,
  onView,
  onOpenStone,
}: {
  onClose: () => void;
  onView: (view: ViewName) => void;
  onOpenStone: (root: string, stoneId: string) => void;
}): JSX.Element {
  const { repos } = useAppState();
  const results = useAllCairns(repos);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const needle = query.trim().toLowerCase();

  const found = useMemo<Result[]>(() => {
    const views: Result[] = VIEWS.filter(
      (entry) => needle === "" || entry.label.toLowerCase().includes(needle) || entry.hint.includes(needle),
    ).map((entry) => ({ kind: "view", id: `view-${entry.view}`, view: entry.view, label: entry.label, hint: entry.hint }));

    const reposFound: Result[] = repos
      .filter((root) => needle !== "" && repoName(root).toLowerCase().includes(needle))
      .map((root) => ({ kind: "repo", id: `repo-${root}`, root }));

    const stones: (Result & { score: number })[] = [];
    repos.forEach((root, i) => {
      const snapshot = results[i]?.data;
      if (!snapshot) return;
      for (const record of snapshot.stones) {
        const score = needle === "" ? 0 : scoreStone(record, needle);
        if (score > 0) {
          stones.push({
            kind: "stone",
            id: `${root}:${record.stone.id}`,
            record,
            root,
            where: snapshot.name,
            score,
          });
        }
      }
    });
    stones.sort((a, b) => b.score - a.score);

    return [...views, ...reposFound, ...stones.slice(0, 40)];
  }, [needle, repos, results]);

  useEffect(() => {
    setCursor(0);
  }, [needle]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor, found]);

  const go = (result: Result | undefined): void => {
    if (!result) return;
    if (result.kind === "view") onView(result.view);
    else if (result.kind === "stone") onOpenStone(result.root, result.record.stone.id);
    onClose();
  };

  const stones = found.filter((r) => r.kind === "stone");
  const commands = found.filter((r) => r.kind !== "stone");

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search the cairn"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setCursor((c) => Math.min(c + 1, found.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(found[cursor]);
          }
        }}
      >
        <div className="palette-field">
          <SearchIcon className="palette-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            placeholder="Search stones, criteria, ULIDs, views…"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            aria-label="Search"
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef}>
          {found.length === 0 ? (
            <div className="palette-empty">Nothing matches “{query}”.</div>
          ) : (
            <>
              {commands.length > 0 ? <div className="palette-group">Go to</div> : null}
              {commands.map((result) => {
                const index = found.indexOf(result);
                const Icon =
                  result.kind === "view"
                    ? (VIEWS.find((v) => v.view === result.view)?.Icon ?? SearchIcon)
                    : FolderIcon;
                return (
                  <button
                    type="button"
                    key={result.id}
                    data-index={index}
                    className={`palette-row ${index === cursor ? "active" : ""}`}
                    onMouseMove={() => {
                      setCursor(index);
                    }}
                    onClick={() => {
                      go(result);
                    }}
                  >
                    <Icon className="palette-row-icon" />
                    <span className="palette-row-title">
                      {result.kind === "view" ? result.label : repoName(result.root)}
                    </span>
                    <span className="palette-row-hint">
                      {result.kind === "view" ? result.hint : "repository"}
                    </span>
                    {index === cursor ? <ArrowTurnIcon className="palette-row-enter" /> : null}
                  </button>
                );
              })}

              {stones.length > 0 ? <div className="palette-group">Stones</div> : null}
              {stones.map((result) => {
                if (result.kind !== "stone") return null;
                const index = found.indexOf(result);
                const { stone } = result.record;
                return (
                  <button
                    type="button"
                    key={result.id}
                    data-index={index}
                    className={`palette-row ${index === cursor ? "active" : ""}`}
                    onMouseMove={() => {
                      setCursor(index);
                    }}
                    onClick={() => {
                      go(result);
                    }}
                  >
                    <StatusMark status={stone.status} />
                    <span className="palette-row-title">{stone.title}</span>
                    {stone.surface ? <span className="surface-tag">{stone.surface}</span> : null}
                    <span className="palette-row-hint mono">{result.where}</span>
                    {index === cursor ? <ArrowTurnIcon className="palette-row-enter" /> : null}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="palette-foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> move
          </span>
          <span>
            <kbd className="kbd">↵</kbd> open
          </span>
          <span>
            <kbd className="kbd">esc</kbd> close
          </span>
          <span className="palette-foot-count">
            {stones.length} {stones.length === 1 ? "stone" : "stones"}
          </span>
        </div>
      </div>
    </div>
  );
}
