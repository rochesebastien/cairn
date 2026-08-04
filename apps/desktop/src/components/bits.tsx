/** The small shared pieces: status dot, chips, kbd, empty states, view chrome. */

import type { CSSProperties, ReactNode } from "react";
import type { StoneStatus } from "../lib/cairn.js";

export function StatusDot({
  status,
  pulse = false,
  className = "",
}: {
  status: StoneStatus;
  pulse?: boolean;
  className?: string;
}): JSX.Element {
  const style = { "--dot": `var(--status-${status})` } as CSSProperties;
  const shape = status === "retired" ? "struck" : status === "draft" ? "hollow" : "";
  return (
    <span
      className={`status-dot ${shape} ${pulse ? "pulse" : ""} ${className}`.trim()}
      style={style}
      title={status}
      aria-label={status}
    />
  );
}

export function StatusChip({ status }: { status: StoneStatus }): JSX.Element {
  return (
    <span className="status-chip">
      <StatusDot status={status} />
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
