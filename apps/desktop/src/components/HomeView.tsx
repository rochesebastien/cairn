/**
 * Home — what the app opens on, before any view is chosen.
 *
 * The mark, then a year of proof runs as one full-width heatmap. Nothing else:
 * the question this screen answers is "has this cairn been kept up?", and the
 * answer is a shape you read in a second, not a table.
 *
 * It reads across *every* open repository by default. A cairn is per
 * repository, but the question is asked of the whole work; the two dropdowns
 * narrow it to one project or one year when you need that.
 */

import { useMemo, useState } from "react";
import { useAllCairns, useAppState } from "../lib/app-state.js";
import { repoName, type RunRecord } from "../lib/cairn.js";
import {
  buildHeatmap,
  busiestDay,
  formatDay,
  heatLevel,
  heatTone,
  percent,
  yearsWithRuns,
  type HeatDay,
} from "../lib/heatmap.js";
import { CairnMark } from "./icons.js";

interface Hovered {
  day: HeatDay;
  /** Tile centre, viewport coordinates — the card is positioned from these. */
  x: number;
  y: number;
}

const ALL = "__all__";

export function HomeView(): JSX.Element {
  const { repos } = useAppState();
  const results = useAllCairns(repos);

  const [project, setProject] = useState<string>(ALL);
  const [hovered, setHovered] = useState<Hovered | null>(null);

  const today = useMemo(() => new Date(), []);

  /** Runs of every repository, or of the one the filter names. */
  const runs = useMemo<RunRecord[]>(() => {
    const out: RunRecord[] = [];
    repos.forEach((root, i) => {
      if (project !== ALL && project !== root) return;
      const snapshot = results[i]?.data;
      if (snapshot) out.push(...snapshot.runs);
    });
    return out;
  }, [repos, results, project]);

  const years = useMemo(() => yearsWithRuns(runs, today), [runs, today]);
  const [year, setYear] = useState<number>(today.getFullYear());
  const activeYear = years.includes(year) ? year : (years[0] ?? today.getFullYear());

  const map = useMemo(() => buildHeatmap(runs, activeYear, today), [runs, activeYear, today]);
  const busiest = useMemo(() => busiestDay(map), [map]);
  const successRate = map.totalRuns > 0 ? map.totalGreen / map.totalRuns : null;
  const loading = results.some((result) => result.isPending);

  return (
    <div className="home-view">
      <header className="home-head">
        <CairnMark className="home-mark" />
      </header>

      <section className="heat" aria-label={`Proof runs in ${activeYear}`}>
        <div className="heat-top">
          <div className="heat-titles">
            <h2 className="heat-title">Proofs replayed</h2>
            <span className="heat-caption">
              {loading
                ? "reading the cairns…"
                : `${map.totalRuns} in ${activeYear} · ${
                    project === ALL ? `${repos.length} repositories` : repoName(project)
                  }`}
            </span>
          </div>

          <div className="heat-controls">
            <label className="select">
              <span className="select-label">Project</span>
              <select
                value={project}
                onChange={(event) => {
                  setProject(event.target.value);
                }}
              >
                <option value={ALL}>All projects</option>
                {repos.map((root) => (
                  <option key={root} value={root}>
                    {repoName(root)}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </label>

            <label className="select">
              <span className="select-label">Year</span>
              <select
                value={activeYear}
                onChange={(event) => {
                  setYear(Number(event.target.value));
                }}
              >
                {years.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </label>
          </div>
        </div>

        <div className="heat-scroll">
          <div className="heat-grid-wrap">
            <div className="heat-months" aria-hidden="true">
              {/* a label in the last columns would run off the right edge */}
              {map.months
                .filter((month) => month.column <= map.weeks.length - 3)
                .map((month) => (
                  <span
                    key={`${month.label}-${month.column}`}
                    className="heat-month"
                    style={{ gridColumnStart: month.column + 1 }}
                  >
                    {month.label}
                  </span>
                ))}
            </div>

            <div className="heat-body">
              <div className="heat-days" aria-hidden="true">
                <span>Mon</span>
                <span>Wed</span>
                <span>Fri</span>
              </div>

              <div
                className="heat-grid"
                role="grid"
                style={{ gridTemplateColumns: `repeat(${map.weeks.length}, minmax(0, 1fr))` }}
              >
                {map.weeks.map((week, w) => (
                  <div className="heat-week" role="row" key={`w-${w}`}>
                    {week.days.map((day) => {
                      if (day.outside) {
                        return <span className="heat-cell is-outside" key={day.date} aria-hidden="true" />;
                      }
                      const tone = heatTone(day);
                      const level = heatLevel(day, busiest);
                      return (
                        <button
                          type="button"
                          key={day.date}
                          className={`heat-cell is-${tone} level-${level}`}
                          role="gridcell"
                          aria-label={
                            day.total === 0
                              ? `${formatDay(day.date)}: no proof replayed`
                              : `${formatDay(day.date)}: ${day.total} proofs, ${percent(day.successRate ?? 0)} passed`
                          }
                          onMouseEnter={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            setHovered({ day, x: box.left + box.width / 2, y: box.top });
                          }}
                          onFocus={(event) => {
                            const box = event.currentTarget.getBoundingClientRect();
                            setHovered({ day, x: box.left + box.width / 2, y: box.top });
                          }}
                          onMouseLeave={() => {
                            setHovered(null);
                          }}
                          onBlur={() => {
                            setHovered(null);
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="heat-foot">
          <div className="heat-stats">
            <span>
              <strong>{map.activeDays}</strong> days with a run
            </span>
            <span aria-hidden="true">·</span>
            <span>
              longest streak <strong>{map.longestStreak}</strong> days
            </span>
            <span aria-hidden="true">·</span>
            <span>{successRate === null ? "no run yet" : `${percent(successRate)} of runs passed`}</span>
          </div>

          <div className="heat-legend">
            <span className="heat-legend-label">less</span>
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className={`heat-cell is-pass level-${level}`} aria-hidden="true" />
            ))}
            <span className="heat-legend-label">more</span>
            <span className="heat-legend-sep" aria-hidden="true" />
            <span className="heat-cell is-mixed level-4" aria-hidden="true" />
            <span className="heat-legend-label">failures creeping in</span>
            <span className="heat-cell is-fail level-4" aria-hidden="true" />
            <span className="heat-legend-label">a bad day</span>
          </div>
        </footer>
      </section>

      {hovered ? <HeatCard hovered={hovered} /> : null}
    </div>
  );
}

function ChevronDown(): JSX.Element {
  return (
    <svg className="select-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.6 6 7.6l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The hover card. Fixed-positioned from the tile's own rect so it escapes the
 * scroll container, and clamped to the viewport so edge tiles stay readable.
 */
function HeatCard({ hovered }: { hovered: Hovered }): JSX.Element {
  const { day, x, y } = hovered;
  const WIDTH = 232;
  const left = Math.min(Math.max(x - WIDTH / 2, 12), window.innerWidth - WIDTH - 12);
  const pass = day.successRate ?? 0;
  const fail = day.total > 0 ? day.red / day.total : 0;

  return (
    <div className="hover-card" role="tooltip" style={{ left, top: y - 12, width: WIDTH }}>
      <div className="hover-day">{formatDay(day.date)}</div>

      {day.total === 0 ? (
        <div className="hover-empty">No proof replayed</div>
      ) : (
        <>
          <div className="hover-count">
            <span className="hover-n mono">{day.total}</span>
            <span className="hover-unit">{day.total === 1 ? "proof replayed" : "proofs replayed"}</span>
          </div>

          <div className="hover-bar" aria-hidden="true">
            {day.green > 0 ? <span className="hover-bar-pass" style={{ flex: day.green }} /> : null}
            {day.red > 0 ? <span className="hover-bar-fail" style={{ flex: day.red }} /> : null}
            {day.skipped > 0 ? <span className="hover-bar-skip" style={{ flex: day.skipped }} /> : null}
          </div>

          <dl className="hover-rows">
            <div className="hover-row">
              <dt>
                <span className="hover-key is-pass" aria-hidden="true" />
                passed
              </dt>
              <dd>
                <span className="mono">{percent(pass)}</span>
                <span className="hover-abs mono">{day.green}</span>
              </dd>
            </div>
            <div className="hover-row">
              <dt>
                <span className="hover-key is-fail" aria-hidden="true" />
                failed
              </dt>
              <dd>
                <span className="mono">{percent(fail)}</span>
                <span className="hover-abs mono">{day.red}</span>
              </dd>
            </div>
            {day.skipped > 0 ? (
              <div className="hover-row">
                <dt>
                  <span className="hover-key is-skip" aria-hidden="true" />
                  skipped
                </dt>
                <dd>
                  <span className="mono">{percent(day.skipped / day.total)}</span>
                  <span className="hover-abs mono">{day.skipped}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
    </div>
  );
}
