import type { StoneRecord, StoneStatus } from "../lib/cairn.js";
import { countByStatus, repoName } from "../lib/cairn.js";
import { useAppState } from "../lib/app-state.js";
import type { Theme } from "../lib/theme.js";
import { StatusMark } from "./bits.js";
import {
  CairnIcon,
  CairnLogo,
  CairnMark,
  EscalationIcon,
  MoonIcon,
  PanelIcon,
  PlayIcon,
  PlusIcon,
  ReviewIcon,
  RunsIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "./icons.js";

/** `home` is what the app opens on: no nav item is selected until you pick one. */
export type ViewName = "home" | "review" | "cairn" | "escalations" | "runs";

const NAV: {
  id: Exclude<ViewName, "home">;
  label: string;
  Icon: (props: { className?: string | undefined }) => JSX.Element;
}[] = [
  { id: "review", label: "Review", Icon: ReviewIcon },
  { id: "cairn", label: "Cairn", Icon: CairnIcon },
  { id: "escalations", label: "Escalations", Icon: EscalationIcon },
  { id: "runs", label: "Runs", Icon: RunsIcon },
];

/** Statuses the repo row summarises, in the order they matter. */
const SUMMARY_STATUSES: StoneStatus[] = ["escalated", "broken", "draft", "proven"];

export function Sidebar({
  view,
  onView,
  stones,
  theme,
  onToggleTheme,
  collapsed,
  onToggleCollapsed,
  onOpenSearch,
  onOpenSettings,
}: {
  view: ViewName;
  onView: (view: ViewName) => void;
  stones: StoneRecord[];
  theme: Theme;
  onToggleTheme: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
}): JSX.Element {
  const { repos, activeRoot, selectRepo, openRepo, verify } = useAppState();
  const counts = countByStatus(stones);

  // Only Review and Escalations carry a count: they are the two queues.
  const badge: Partial<Record<ViewName, number>> = {
    ...(counts.draft > 0 ? { review: counts.draft } : {}),
    ...(counts.escalated > 0 ? { escalations: counts.escalated } : {}),
  };

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-head">
        <button
          type="button"
          className={`brand ${view === "home" ? "active" : ""}`}
          onClick={() => {
            onView("home");
          }}
          aria-label="Home"
          aria-current={view === "home" ? "page" : undefined}
        >
          {collapsed ? <CairnMark className="brand-glyph" /> : <CairnLogo className="brand-logo" />}
        </button>
        <button
          type="button"
          className="rail-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
          title={collapsed ? "Expand the sidebar" : "Collapse the sidebar"}
        >
          <PanelIcon className="nav-icon" />
        </button>
      </div>

      <nav className="sidebar-section" aria-label="Views">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${view === id ? "active" : ""}`}
            onClick={() => {
              onView(id);
            }}
            aria-current={view === id ? "page" : undefined}
            title={collapsed ? label : undefined}
          >
            <Icon className="nav-icon" />
            <span className="nav-label">{label}</span>
            {badge[id] ? <span className="count-badge">{badge[id]}</span> : null}
            {id === "runs" && verify.running ? <span className="count-badge">···</span> : null}
          </button>
        ))}

        {/* Search sits under Cairn's views because it searches across all of them */}
        <button type="button" className="nav-item" onClick={onOpenSearch} title={collapsed ? "Search" : undefined}>
          <SearchIcon className="nav-icon" />
          <span className="nav-label">Search</span>
          <span className="nav-kbd">
            <kbd className="kbd">⌘K</kbd>
          </span>
        </button>
      </nav>

      <div className="sidebar-section" style={{ flex: 1, minHeight: 0 }}>
        <div className="sidebar-label">Repositories</div>
        <div className="repo-list">
          {repos.map((root) => {
            const isActive = root === activeRoot;
            return (
              <button
                key={root}
                type="button"
                className={`repo-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  selectRepo(root);
                }}
                title={root}
              >
                <span className="repo-name">{repoName(root)}</span>
                {isActive ? (
                  <span className="repo-marks">
                    {SUMMARY_STATUSES.filter((status) => counts[status] > 0).map((status) => (
                      <StatusMark key={status} status={status} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
          <button
            type="button"
            className="repo-item repo-open"
            onClick={() => {
              void openRepo();
            }}
          >
            <PlusIcon className="nav-icon" />
            <span className="repo-name">open repo…</span>
          </button>
        </div>
      </div>

      <div className="sidebar-foot">
        <button
          type="button"
          className="verify-launcher"
          disabled={verify.running || !activeRoot}
          onClick={() => {
            onView("runs");
            void verify.run();
          }}
          title={collapsed ? "Verify" : undefined}
        >
          <PlayIcon />
          <span className="nav-label">{verify.running ? "verifying…" : "Verify"}</span>
        </button>

        <div className="foot-row">
          <button
            type="button"
            className="nav-item settings-link"
            onClick={onOpenSettings}
            title={collapsed ? "Settings" : undefined}
          >
            <SettingsIcon className="nav-icon" />
            <span className="nav-label">Settings</span>
          </button>
          <button
            type="button"
            className="theme-switch"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
            title={theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme"}
          >
            {theme === "dark" ? <MoonIcon className="nav-icon" /> : <SunIcon className="nav-icon" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
