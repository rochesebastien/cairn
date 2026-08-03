import { useMemo, useState } from "react";
import { useAppState, useCairn, useProvenPulse } from "./lib/app-state.js";
import { useTheme } from "./lib/theme.js";
import { Sidebar, type ViewName } from "./components/Sidebar.js";
import { ReviewView } from "./components/ReviewView.js";
import { CairnView } from "./components/CairnView.js";
import { EscalationsView } from "./components/EscalationsView.js";
import { RunsView } from "./components/RunsView.js";
import { StoneDrawer } from "./components/StoneDrawer.js";
import { Empty, ViewHeader } from "./components/bits.js";

export function App(): JSX.Element {
  const { theme, toggle } = useTheme();
  const { activeRoot, openRepo } = useAppState();
  const [view, setView] = useState<ViewName>("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cairn = useCairn(activeRoot);
  const snapshot = cairn.data;
  const stones = useMemo(() => snapshot?.stones ?? [], [snapshot]);
  const pulsing = useProvenPulse(snapshot?.stones);

  const drafts = stones.filter((record) => record.stone.status === "draft");
  const selected = selectedId ? stones.find((record) => record.stone.id === selectedId) : undefined;

  return (
    <div className="app-shell">
      <Sidebar view={view} onView={setView} stones={stones} theme={theme} onToggleTheme={toggle} />

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
    </div>
  );
}
