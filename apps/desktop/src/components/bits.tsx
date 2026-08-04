/** The small shared pieces: status dot, chips, kbd, empty states, view chrome. */

import type { ReactNode } from "react";
import type { StoneStatus } from "../lib/cairn.js";
import { BrokenMark, DraftMark, EscalatedMark, ProvenMark, RetiredMark } from "./icons.js";

const MARKS: Record<StoneStatus, (props: { className?: string | undefined }) => JSX.Element> = {
  draft: DraftMark,
  proven: ProvenMark,
  broken: BrokenMark,
  escalated: EscalatedMark,
  retired: RetiredMark,
};

/**
 * A status, carried by shape and weight instead of a hue. Pair it with
 * `StatusLabel` (or a `StatusChip`) wherever the layout has room for words —
 * the glyph alone is never the whole message.
 */
export function StatusMark({
  status,
  pulse = false,
  className = "",
}: {
  status: StoneStatus;
  pulse?: boolean;
  className?: string;
}): JSX.Element {
  const Glyph = MARKS[status];
  return (
    <span className="status-mark-wrap" role="img" aria-label={status} title={status}>
      <Glyph className={`status-mark is-${status} ${pulse ? "pulse" : ""} ${className}`.trim()} />
    </span>
  );
}

export function StatusLabel({ status }: { status: StoneStatus }): JSX.Element {
  return <span className="status-label">{status}</span>;
}

export function StatusChip({ status }: { status: StoneStatus }): JSX.Element {
  return (
    <span className="status-chip">
      <StatusMark status={status} />
      {status}
    </span>
  );
}

export function SurfaceTag({ surface }: { surface?: string | undefined }): JSX.Element | null {
  if (!surface) return null;
  return <span className="surface-tag">{surface}</span>;
}

export function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return <span className="kbd">{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string | undefined }): JSX.Element {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint ? <div className="empty-hint">{hint}</div> : null}
    </div>
  );
}

export function ViewHeader({
  title,
  subtitle,
  tools,
}: {
  title: string;
  subtitle?: ReactNode | undefined;
  tools?: ReactNode | undefined;
}): JSX.Element {
  return (
    <header className="view-header">
      <div>
        <h1 className="view-title">{title}</h1>
        {subtitle ? <p className="view-subtitle">{subtitle}</p> : null}
      </div>
      {tools ? <div className="view-tools">{tools}</div> : null}
    </header>
  );
}

export function FilterGroup({ children }: { children: ReactNode }): JSX.Element {
  return <div className="filter-group">{children}</div>;
}

export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number | undefined;
}): JSX.Element {
  return (
    <button type="button" className={`filter-chip ${active ? "active" : ""}`} onClick={onClick}>
      {children}
      {count === undefined ? null : <span className="filter-count">{count}</span>}
    </button>
  );
}
