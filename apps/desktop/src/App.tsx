import { useEffect, useMemo, useState } from "react";
import { useAppState, useCairn, useProvenPulse } from "./lib/app-state.js";
import { useTheme } from "./lib/theme.js";
import { useSettings } from "./lib/settings.js";
import { Sidebar, type ViewName } from "./components/Sidebar.js";
import { SearchPalette } from "./components/SearchPalette.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { ReviewView } from "./components/ReviewView.js";
import { CairnView } from "./components/CairnView.js";
import { EscalationsView } from "./components/EscalationsView.js";
import { RunsView } from "./components/RunsView.js";
import { HomeView } from "./components/HomeView.js";
import { StoneDrawer } from "./components/StoneDrawer.js";
import { Empty, ViewHeader } from "./components/bits.js";

export function App(): JSX.Element {
  const { theme, toggle } = useTheme();
  const { settings, set } = useSettings();
  const { activeRoot, openRepo, selectRepo } = useAppState();
  const [view, setView] = useState<ViewName>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(settings.sidebarCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ⌘K / Ctrl-K opens the palette from anywhere, the way every tool does it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const cairn = useCairn(activeRoot);
  const snapshot = cairn.data;
  const stones = useMemo(() => snapshot?.stones ?? [], [snapshot]);
  const pulsing = useProvenPulse(snapshot?.stones);

  const drafts = stones.filter((record) => record.stone.status === "draft");
  const selected = selectedId ? stones.find((record) => record.stone.id === selectedId) : undefined;

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onView={setView}
        stones={stones}
        theme={theme}
        onToggleTheme={toggle}
        collapsed={collapsed}
        onToggleCollapsed={() => {
          setCollapsed((current) => {
            set("sidebarCollapsed", !current);
            return !current;
          });
        }}
        onOpenSearch={() => {
          setSearchOpen(true);
        }}
        onOpenSettings={() => {
          setSettingsOpen(true);
        }}
      />

      <main className="main">
        <div className="view-card">
          {activeRoot === null ? (
            <>
              <ViewHeader title="Cairn" subtitle="no repository open" />
              <div className="view-body">
                <Empty
                  title="Open a repository"
                  hint="Cairn has no database — the repository is the state. Pick a folder that owns a .cairn/ directory."
                />
                <div className="row" style={{ justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => {
                      void openRepo();
                    }}
                  >
                    Open repo…
                  </button>
                </div>
              </div>
            </>
          ) : cairn.isPending ? (
            <>
              <ViewHeader title="Reading the cairn" subtitle={activeRoot} />
              <div className="view-body">
                <Empty title="Reading .cairn/…" />
              </div>
            </>
          ) : cairn.isError ? (
            <>
              <ViewHeader title="Cannot read the cairn" subtitle={activeRoot} />
              <div className="view-body">
                <Empty
                  title={(cairn.error as Error).message}
                  hint="Check that this folder owns a .cairn/ directory, then try again."
                />
              </div>
            </>
          ) : view === "home" ? (
            <HomeView />
          ) : view === "review" ? (
            <ReviewView drafts={drafts} onOpen={setSelectedId} drawerOpen={selected !== undefined} />
          ) : view === "cairn" ? (
            <CairnView stones={stones} selectedId={selectedId} pulsing={pulsing} onOpen={setSelectedId} />
          ) : view === "escalations" ? (
            snapshot ? (
              <EscalationsView snapshot={snapshot} onOpen={setSelectedId} />
            ) : null
          ) : (
            <RunsView snapshot={snapshot} />
          )}
        </div>
      </main>

      {selected && snapshot ? (
        <StoneDrawer
          record={selected}
          snapshot={snapshot}
          onOpen={setSelectedId}
          onClose={() => {
            setSelectedId(null);
          }}
        />
      ) : null}

      {searchOpen ? (
        <SearchPalette
          onClose={() => {
            setSearchOpen(false);
          }}
          onView={setView}
          onOpenStone={(root, stoneId) => {
            // a stone may live in a repository other than the open one
            if (root !== activeRoot) selectRepo(root);
            setView("cairn");
            setSelectedId(stoneId);
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false);
          }}
          theme={theme}
          onToggleTheme={toggle}
          settings={settings}
          onSet={(key, value) => {
            set(key, value);
            if (key === "sidebarCollapsed") setCollapsed(value as boolean);
          }}
        />
      ) : null}
    </div>
  );
}
