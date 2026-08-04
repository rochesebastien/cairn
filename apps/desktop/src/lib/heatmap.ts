/**
 * The home heatmap: proof runs, one tile per day, a year at a time.
 *
 * Pure aggregation over `RunRecord[]` — no React, no dates from the clock
 * except the `today` the caller passes in, so the whole thing is testable and
 * deterministic.
 */

import type { RunRecord } from "./cairn.js";

export interface HeatDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Runs recorded that day — "how many proofs were replayed". */
  total: number;
  green: number;
  red: number;
  skipped: number;
  /** 0…1, share of the day's runs that passed. `null` when nothing ran. */
  successRate: number | null;
  /** Days outside the window keep a slot in the grid but render as a gap. */
  outside: boolean;
}

export interface HeatWeek {
  days: HeatDay[];
}

export interface Heatmap {
  weeks: HeatWeek[];
  /** Month index (0…11) aligned to the week column it starts in; named by the view, in the UI locale. */
  months: { month: number; column: number }[];
  totalRuns: number;
  totalGreen: number;
  totalRed: number;
  /** Days with at least one run. */
  activeDays: number;
  /** Longest streak of consecutive days that had a run, in days. */
  longestStreak: number;
  from: string;
  to: string;
}

/** Local `YYYY-MM-DD` — never `toISOString()`, which would shift the day in UTC-negative zones. */
export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Every calendar year that has at least one run, newest first. */
export function yearsWithRuns(runs: RunRecord[], today: Date): number[] {
  const years = new Set<number>([today.getFullYear()]);
  for (const run of runs) {
    const at = new Date(run.at);
    if (!Number.isNaN(at.getTime())) years.add(at.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Build the grid for one calendar year.
 *
 * Columns are full Sun→Sat weeks — the shape GitHub uses, for the reason the
 * eye reads columns — so the grid overshoots the year at both ends; those
 * days, and any day still in the future, keep their slot but render as a gap.
 */
export function buildHeatmap(runs: RunRecord[], year: number, today: Date): Heatmap {
  const byDay = new Map<string, { green: number; red: number; skipped: number }>();

  for (const run of runs) {
    const at = new Date(run.at);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    const bucket = byDay.get(key) ?? { green: 0, red: 0, skipped: 0 };
    bucket[run.verdict] += 1;
    byDay.set(key, bucket);
  }

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);
  const start = addDays(jan1, -jan1.getDay());
  const end = addDays(dec31, 6 - dec31.getDay());
  const weeks = Math.round((end.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  const todayKey = dayKey(today);

  const out: HeatWeek[] = [];
  const months: { month: number; column: number }[] = [];
  let totalRuns = 0;
  let totalGreen = 0;
  let totalRed = 0;
  let activeDays = 0;
  let streak = 0;
  let longestStreak = 0;
  let lastMonth = -1;

  for (let w = 0; w < weeks; w += 1) {
    const days: HeatDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(start, w * 7 + d);
      const key = dayKey(date);
      const outside = date.getFullYear() !== year || key > todayKey;
      const bucket = byDay.get(key);
      const green = bucket?.green ?? 0;
      const red = bucket?.red ?? 0;
      const skipped = bucket?.skipped ?? 0;
      const total = green + red + skipped;

      if (!outside) {
        totalRuns += total;
        totalGreen += green;
        totalRed += red;
        if (total > 0) {
          activeDays += 1;
          streak += 1;
          longestStreak = Math.max(longestStreak, streak);
        } else {
          streak = 0;
        }
      }

      days.push({
        date: key,
        total,
        green,
        red,
        skipped,
        successRate: total > 0 ? green / total : null,
        outside,
      });

      // Month label sits on the week whose first row crosses into a new month.
      if (d === 0 && date.getFullYear() === year) {
        const month = date.getMonth();
        if (month !== lastMonth) {
          months.push({ month, column: w });
          lastMonth = month;
        }
      }
    }
    out.push({ days });
  }

  return {
    weeks: out,
    months,
    totalRuns,
    totalGreen,
    totalRed,
    activeDays,
    longestStreak,
    from: dayKey(jan1),
    to: dayKey(dec31) < todayKey ? dayKey(dec31) : todayKey,
  };
}

/**
 * Tile appearance. Volume drives the alpha step (0…4); the day's success rate
 * drives the hue.
 *
 * The thresholds matter: on a busy day one red proof out of nine is normal
 * weather, not a bad day, so "any red at all" would paint almost every tile
 * red and say nothing. A day is green when nearly everything passed, orange
 * when failures are creeping in, red when the day genuinely went wrong.
 */
export type HeatTone = "empty" | "neutral" | "pass" | "mixed" | "fail";

export function heatTone(day: HeatDay): HeatTone {
  if (day.total === 0) return "empty";
  if (day.successRate === null) return "neutral";
  if (day.successRate >= 0.9) return "pass";
  if (day.successRate >= 0.6) return "mixed";
  return "fail";
}

/** 0 = empty, 1…4 = quartiles of the busiest day in the window. */
export function heatLevel(day: HeatDay, busiest: number): number {
  if (day.total === 0) return 0;
  if (busiest <= 1) return 4;
  const ratio = day.total / busiest;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export function busiestDay(map: Heatmap): number {
  let max = 0;
  for (const week of map.weeks) {
    for (const day of week.days) {
      if (!day.outside && day.total > max) max = day.total;
    }
  }
  return max;
}

/** "12 March 2026" / "12 mars 2026" — the hover card's heading, in the UI locale. */
export function formatDay(key: string, locale = "en-GB"): string {
  const [year, month, day] = key.split("-").map((part) => Number(part));
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

/** "Jan" / "janv." — a column heading, so the short form. */
export function monthLabel(month: number, locale = "en-GB"): string {
  return new Date(2000, month, 1).toLocaleDateString(locale, { month: "short" });
}

/**
 * The three weekday captions of the grid, in the UI locale. The grid runs
 * Sun→Sat, and only rows 2, 4 and 6 are labelled — 2000-01-02 was a Sunday.
 */
export function weekdayLabels(locale = "en-GB"): string[] {
  return [1, 3, 5].map((offset) =>
    new Date(2000, 0, 2 + offset).toLocaleDateString(locale, { weekday: "short" }),
  );
}

export function percent(value: number, locale = "en-GB"): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}
