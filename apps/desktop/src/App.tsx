import { useEffect, useMemo, useState, type JSX } from "react";
import { useAppState, useCairn, useProvenPulse } from "./lib/app-state.js";
import { useTheme } from "./lib/theme.js";
import { useSettings, type Settings } from "./lib/settings.js";
import { LangProvider, useT } from "./lib/i18n.js";
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

/**
 * The language has to be provided *above* the shell, not beside it: everything
 * below — including this file's own empty states — reads it through useT().
 */
export function App(): JSX.Element {
  const { settings, set } = useSettings();
  return (
    <LangProvider lang={settings.language}>
      <Shell settings={settings} set={set} />
    </LangProvider>
  );
}

function Shell({
  settings,
  set,
}: {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}): JSX.Element {
  const t = useT();
  const { theme, toggle } = useTheme();
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
              {/* "Cairn" is the product, not a word to translate */}
              <ViewHeader title="Cairn" subtitle={t("shell.noRepo")} />
              <div className="view-body">
                <Empty title={t("shell.openRepoTitle")} hint={t("shell.openRepoHint")} />
                <div className="row" style={{ justifyContent: "center" }}>
                  <button
                    type="button"
                    className="btn btn-accent"
                    onClick={() => {
                      void openRepo();
                    }}
                  >
                    {t("shell.openRepo")}
                  </button>
                </div>
              </div>
            </>
          ) : cairn.isPending ? (
            <>
              <ViewHeader title={t("shell.reading")} subtitle={activeRoot} />
              <div className="view-body">
                <Empty title={t("shell.readingBody")} />
              </div>
            </>
          ) : cairn.isError ? (
            <>
              <ViewHeader title={t("shell.cannotRead")} subtitle={activeRoot} />
              <div className="view-body">
                <Empty title={(cairn.error as Error).message} hint={t("shell.cannotReadHint")} />
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
