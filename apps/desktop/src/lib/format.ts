/**
 * Small formatting helpers. Dates read as prose, ids read as record (mono).
 *
 * Anything a human reads as a sentence — "3 days ago", "1.4s" — takes the UI
 * locale, so a French UI never prints an English date. Anything that is a
 * *record* — ULIDs, hashes, commit shas, the ISO timestamps in the drawer and
 * the warden report — stays verbatim in every language.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    // "short", not "narrow": narrow French drops the wording and prints "-2 min".
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

/** "3 days ago" / "il y a 3 j" — the unit ladder is ours, the wording is the locale's. */
export function relativeTime(iso: string, locale = "en-GB", now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "—";
  const delta = now - at;
  const rtf = relativeFormatter(locale);
  if (delta < MINUTE) return rtf.format(0, "second");
  if (delta < HOUR) return rtf.format(-Math.floor(delta / MINUTE), "minute");
  if (delta < DAY) return rtf.format(-Math.floor(delta / HOUR), "hour");
  if (delta < 30 * DAY) return rtf.format(-Math.floor(delta / DAY), "day");
  const months = Math.floor(delta / (30 * DAY));
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

/** A record timestamp, not prose: ISO in every language, rendered in mono. */
export function absoluteTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

/** First 10 characters of a ULID — enough to be unique in a human cairn. */
export function shortId(id: string): string {
  return id.slice(0, 10);
}

export function formatDuration(ms: number, locale = "en-GB"): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms.toLocaleString(locale)}ms`;
  return `${(ms / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s`;
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
