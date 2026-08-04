# cairn-desktop

The Cairn review app: read the stones, approve the drafts, watch the proofs.

Tauri 2 + React 18 + Vite + TypeScript. No component library — every component is
hand-rolled from the tokens in [`src/app.css`](./src/app.css), which implement
[DESIGN.md](./DESIGN.md) literally. Read DESIGN.md before touching the styling.

## Run it

```bash
# browser, against the in-memory demo cairn — no Rust, no repository needed
pnpm --filter cairn-desktop dev        # http://localhost:5183

# the real app: a Tauri window reading a repository on disk
pnpm --filter cairn-desktop tauri:dev  # needs the Rust toolchain + webkit2gtk

# what CI checks
pnpm --filter cairn-desktop typecheck
pnpm --filter cairn-desktop build      # tsc --noEmit && vite build
```

`pnpm dev` in a plain browser always uses `DemoSource`: a fabricated cairn of
16 stones across all five statuses, with a three-deep amendment lineage, two
escalations (one with a full warden report and diff), and a run history. It
exists so every screen can be reviewed without Tauri. The sidebar tags the
source `demo` so nobody mistakes it for a repository.

## Where things live

| Path                     | What                                                              |
| ------------------------ | ----------------------------------------------------------------- |
| `src/app.css`            | The whole design system: tokens, then components. No inline colours. |
| `src/lib/cairn.ts`       | `CairnSource` — the only interface the UI talks to — plus selectors. |
| `src/lib/demo.ts`        | `DemoSource`, the browser fallback.                                |
| `src/lib/tauri.ts`       | `TauriSource`: Rust commands, streamed verify output, file watcher. |
| `src/lib/app-state.tsx`  | TanStack Query keys/hooks, run log, review decisions, theme pulse.  |
| `src/components/`        | Sidebar, the four views, the stone drawer, the shared bits.        |
| `src-tauri/src/lib.rs`   | `pick_repo`, `read_cairn`, `read_proof`, `run_verify`, the watcher. |

## Honest edges (v1)

- **Approve does not write.** Review decisions live in the session only. Wiring
  them means calling the MCP tools `create_draft` / `amend_stone`; the UI says so
  instead of pretending the stone moved. Same for the three escalation actions.
- **Run history is thin for a real repo.** Phase 1 stores no run journal in
  `.cairn/` — a stone only remembers `lastGreen`. The drawer therefore shows the
  runs this app launched plus one row derived from `lastGreen`, marked as such.
- **No warden report is persisted yet** either, so the escalations view falls
  back to "no report was written for this stone" on a real cairn.
- **`cairn.config.ts` is read, not evaluated.** The app scrapes `baseURL` and the
  directories off the source text; the CLI (which runs it through jiti) stays the
  authority.
- The proof viewer keeps one dark code theme in both app themes — a known gap,
  called out in DESIGN.md.

## Parsing

Stone files are parsed with `@cairn/core`'s pure parser, imported through the
browser-safe subpath `@cairn/core/stone-parse` (schema via `@cairn/core/schema`).
There is no second parser in this app, and no `node:` builtin ends up in the
bundle.
