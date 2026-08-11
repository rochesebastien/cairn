import pc from "picocolors";
import type { Stone, StoneStatus, Violation } from "@usecairn/core";
import type { Io } from "./io.js";

/** One glyph + colour per status, so a list scans in a glance. */
const STATUS_STYLE: Record<StoneStatus, { mark: string; paint: (s: string) => string }> = {
  draft: { mark: "·", paint: (s) => pc.dim(s) },
  proven: { mark: "✓", paint: (s) => pc.green(s) },
  broken: { mark: "✗", paint: (s) => pc.red(s) },
  escalated: { mark: "!", paint: (s) => pc.yellow(s) },
  retired: { mark: "—", paint: (s) => pc.dim(pc.strikethrough(s)) },
};

export function statusMark(status: StoneStatus): string {
  return STATUS_STYLE[status].mark;
}

export function paintStatus(status: StoneStatus, text: string = status): string {
  return STATUS_STYLE[status].paint(text);
}

/** ULIDs are 26 chars; a short form is enough for a human to disambiguate. */
export function shortId(id: string, length = SHORT_ID_MIN): string {
  return id.slice(0, length);
}

/** Shortest id the CLI will ever print. */
export const SHORT_ID_MIN = 8;

/**
 * Abbreviate a set of ids the way git abbreviates hashes: the shortest prefix
 * that is still unique across the set, never below SHORT_ID_MIN.
 *
 * This is not cosmetic. A ULID begins with 10 characters of timestamp, so its
 * first 8 characters only resolve to ~256 ms — two stones raised in the same
 * breath share them. A printed id that cannot be typed back into `cairn show`
 * would make the list useless for anyone managing a cairn by hand.
 */
export function abbreviateIds(ids: readonly string[], min = SHORT_ID_MIN): (id: string) => string {
  const longest = ids.reduce((max, id) => Math.max(max, id.length), min);
  let length = min;
  while (length < longest && new Set(ids.map((id) => id.slice(0, length))).size < ids.length) {
    length += 1;
  }
  return (id: string) => id.slice(0, length);
}

const ANSI = /\u001B\[[0-9;]*m/g;

export function visibleWidth(text: string): number {
  return text.replace(ANSI, "").length;
}

function pad(text: string, width: number): string {
  const missing = width - visibleWidth(text);
  return missing > 0 ? text + " ".repeat(missing) : text;
}

/**
 * A compact table. Columns are sized on their visible width so colours never
 * break the alignment; the last column is never padded (no trailing spaces).
 */
export function renderTable(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((header, index) =>
    Math.max(visibleWidth(header), ...rows.map((row) => visibleWidth(row[index] ?? ""))),
  );

  const line = (cells: string[]): string =>
    cells
      .map((cell, index) => (index === cells.length - 1 ? cell : pad(cell, widths[index] ?? 0)))
      .join("  ")
      .replace(/\s+$/, "");

  return [pc.dim(line(headers.map((h) => h.toUpperCase()))), ...rows.map(line)];
}

/** `proven  3   draft  2` style summary line. */
export function renderCounts(counts: Record<StoneStatus, number>): string {
  return (Object.keys(counts) as StoneStatus[])
    .map((status) => `${paintStatus(status, status)} ${pc.bold(String(counts[status]))}`)
    .join(pc.dim("  ·  "));
}

export function stoneLine(stone: Stone): string {
  return `${paintStatus(stone.status, statusMark(stone.status))} ${pc.dim(shortId(stone.id))} ${stone.title}`;
}

/** Acceptance lint violations, grouped per criterion. */
export function printViolations(io: Io, violations: readonly Violation[]): void {
  const byIndex = new Map<number, Violation[]>();
  for (const violation of violations) {
    const bucket = byIndex.get(violation.index);
    if (bucket) bucket.push(violation);
    else byIndex.set(violation.index, [violation]);
  }

  for (const [index, group] of byIndex) {
    io.err(`  ${pc.bold(`criterion ${index + 1}`)}  ${pc.italic(group[0]?.criterion ?? "")}`);
    for (const violation of group) {
      io.err(`    ${pc.red(violation.rule)}  ${violation.message}`);
    }
  }
}

export function printError(io: Io, message: string, details: string[] = []): void {
  io.err(`${pc.red("✗")} ${message}`);
  for (const detail of details) io.err(`  ${pc.dim(detail)}`);
}

export function printOk(io: Io, message: string): void {
  io.out(`${pc.green("✓")} ${message}`);
}

export function printInfo(io: Io, message: string): void {
  io.out(`${pc.dim("·")} ${message}`);
}

export function printWarn(io: Io, message: string): void {
  io.err(`${pc.yellow("!")} ${message}`);
}

/** JSON for agents: stable two-space indentation, one trailing newline. */
export function printJson(io: Io, value: unknown): void {
  io.out(JSON.stringify(value, null, 2));
}

export function relativeDate(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toISOString().slice(0, 10);
}
