import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CairnSnapshot, StoneRecord, VerifyOptions, VerifyOutcome } from "./cairn.js";
import { getSource } from "./source.js";

/* --------------------------------------------------------------- queries */

export const queryKeys = {
  cairn: (root: string) => ["cairn", root] as const,
  proof: (root: string, path: string) => ["proof", root, path] as const,
};

export function useCairn(root: string | null) {
  const source = getSource();
  return useQuery({
    queryKey: queryKeys.cairn(root ?? ""),
    enabled: root !== null,
    queryFn: () => source.readCairn(root as string),
    staleTime: 5_000,
  });
}

/**
 * Every open repository at once. The home screen reads across all of them by
 * default — a cairn is per repository, but "have the proofs been kept up?" is
 * a question you ask of your whole work, not of one folder.
 */
export function useAllCairns(roots: string[]) {
  const source = getSource();
  return useQueries({
    queries: roots.map((root) => ({
      queryKey: queryKeys.cairn(root),
      queryFn: () => source.readCairn(root),
      staleTime: 5_000,
    })),
  });
}

export function useProof(root: string | null, proofPath: string | null) {
  const source = getSource();
  return useQuery({
    queryKey: queryKeys.proof(root ?? "", proofPath ?? ""),
    enabled: root !== null && proofPath !== null,
    queryFn: () => source.readProof(root as string, proofPath as string),
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------- run log */

export type LogKind = "plain" | "command" | "green" | "red" | "dim";

export interface LogLine {
  id: number;
  text: string;
  kind: LogKind;
}

function classify(line: string): LogKind {
  if (line.startsWith("$")) return "command";
  if (/\b(fail|failed|error|red|✘|✗)\b/i.test(line)) return "red";
  if (/\b(ok|passed|green|✓|✔)\b/i.test(line)) return "green";
  if (line.trim() === "") return "dim";
  return "plain";
}

/* --------------------------------------------------------------- context */

export type Decision = "approved" | "rephrase" | "rejected";

interface AppStateValue {
  sourceKind: "tauri" | "demo";
  sourceLabel: string;
  repos: string[];
  activeRoot: string | null;
  selectRepo: (root: string) => void;
  openRepo: () => Promise<void>;
  /** Verify state, shared by the sidebar launcher and the Runs view. */
  verify: {
    running: boolean;
    command: string | null;
    lines: LogLine[];
    outcome: VerifyOutcome | null;
    run: (options?: Omit<VerifyOptions, "root">) => Promise<void>;
    clear: () => void;
  };
  /**
   * Review decisions. v1 records them in the session only: nothing is written
   * to `.cairn/` from the app yet (see ReviewView for the intended wiring).
   */
  decisions: Record<string, Decision>;
  decide: (stoneId: string, decision: Decision) => void;
  undecide: (stoneId: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const source = getSource();
  const queryClient = useQueryClient();

  const [repos, setRepos] = useState<string[]>(() => source.initialRepos());
  const [activeRoot, setActiveRoot] = useState<string | null>(() => source.initialRepos()[0] ?? null);
  const [running, setRunning] = useState(false);
  const [command, setCommand] = useState<string | null>(null);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const lineId = useRef(0);

  const push = useCallback((text: string, kind?: LogKind) => {
    lineId.current += 1;
    setLines((current) => [...current, { id: lineId.current, text, kind: kind ?? classify(text) }]);
  }, []);

  const selectRepo = useCallback((root: string) => {
    setActiveRoot(root);
  }, []);

  const openRepo = useCallback(async () => {
    const picked = await source.pickRepo();
    if (!picked) return;
    setRepos((current) => (current.includes(picked) ? current : [...current, picked]));
    setActiveRoot(picked);
  }, [source]);

  const run = useCallback(
    async (options: Omit<VerifyOptions, "root"> = {}) => {
      if (!activeRoot || running) return;
      setRunning(true);
      setOutcome(null);
      try {
        const result = await source.runVerify({ root: activeRoot, ...options }, (event) => {
          if (event.type === "start") {
            setCommand(event.command);
            push(`$ ${event.command}`, "command");
          } else if (event.type === "line") {
            push(event.line);
          } else {
            push(
              event.code === 0 ? "· run finished, the cairn is happy" : `· run finished with exit code ${event.code}`,
              event.code === 0 ? "green" : "red",
            );
          }
        });
        setOutcome(result);
      } catch (error) {
        push(`· verify could not start: ${error instanceof Error ? error.message : String(error)}`, "red");
      } finally {
        setRunning(false);
        if (activeRoot) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.cairn(activeRoot) });
        }
      }
    },
    [activeRoot, push, queryClient, running, source],
  );

  const clear = useCallback(() => {
    setLines([]);
    setOutcome(null);
    setCommand(null);
  }, []);

  const decide = useCallback((stoneId: string, decision: Decision) => {
    setDecisions((current) => ({ ...current, [stoneId]: decision }));
  }, []);

  const undecide = useCallback((stoneId: string) => {
    setDecisions((current) => {
      const next = { ...current };
      delete next[stoneId];
      return next;
    });
  }, []);

  // The registry is the state: when the warden writes, refetch.
  useEffect(() => {
    if (!activeRoot) return;
    let disposed = false;
    let stop: (() => void) | null = null;
    void source
      .watch(activeRoot, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.cairn(activeRoot) });
      })
      .then((unwatch) => {
        if (disposed) unwatch();
        else stop = unwatch;
      });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [activeRoot, queryClient, source]);

  const value = useMemo<AppStateValue>(
    () => ({
      sourceKind: source.kind,
      sourceLabel: source.label,
      repos,
      activeRoot,
      selectRepo,
      openRepo,
      verify: { running, command, lines, outcome, run, clear },
      decisions,
      decide,
      undecide,
    }),
    [
      activeRoot,
      clear,
      command,
      decide,
      decisions,
      lines,
      openRepo,
      outcome,
      repos,
      run,
      running,
      selectRepo,
      source.kind,
      source.label,
      undecide,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) throw new Error("useAppState must be used inside <AppStateProvider>");
  return value;
}

/**
 * The single moment of delight in the app: a stone that turns `proven` after a
 * local verify gives its status mark one soft opacity pulse. Nothing else moves
 * on status change.
 */
export function useProvenPulse(stones: StoneRecord[] | undefined): Set<string> {
  const previous = useRef<Map<string, string>>(new Map());
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!stones) return;
    const next = new Map(stones.map((record) => [record.stone.id, record.stone.status]));
    const turned: string[] = [];
    for (const [id, status] of next) {
      const before = previous.current.get(id);
      if (before && before !== "proven" && status === "proven") turned.push(id);
    }
    previous.current = next;
    if (turned.length === 0) return;
    setPulsing(new Set(turned));
    const timer = setTimeout(() => {
      setPulsing(new Set());
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [stones]);

  return pulsing;
}

/** Snapshot helper used by views that need the whole cairn or nothing. */
export function emptySnapshot(root: string): CairnSnapshot {
  return {
    root,
    name: root,
    stones: [],
    unreadable: [],
    config: null,
    runs: [],
    reports: {},
    readAt: new Date().toISOString(),
  };
}
