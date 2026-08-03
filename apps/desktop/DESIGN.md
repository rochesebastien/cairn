# DESIGN.md

Visual identity for the Cairn desktop app.

## Direction

Refined minimal. Closer to Apple's own apps, Linear, Capacities than to dashboard SaaS. Restraint is the point — character comes from typography, spacing, and atmosphere, not from heavy chrome or loud animation.

The app reads as a tool, not a brand showcase. The metaphor is mineral: stones stacked on a dark trail. The single bold choice is a warm **trail-marker amber** ambient gradient (brand `#D97A16`) that anchors the near-black canvas — the glow of a blaze painted on rock, not a neon sign.

Cairn is a *reading* app before anything else. The pitch of the UI is not "watch tests go green", it is: **do these stones describe what I wanted?** Every layout decision optimizes for reading intent quickly — generous line length, calm hierarchy, nothing competing with the words.

## What we are NOT

- No Inter / Roboto / system-font default look.
- No purple gradient on white. No "AI dashboard" template.
- No skeuomorphic depth. No glassy buttons. No neumorphism.
- No scattered micro-interactions (button bounces, input wiggles, etc.).
- No traffic-light dashboard: status color is metadata, never decoration. A screen full of green tiles is exactly the failure mode.

## Tokens

Defined in `src/app.css`. Use the variables; never hardcode.

### Color

```
--bg-base           #0c0b0a               page base (warm near-black)
--bg-glow-primary   amber/0.14            ambient glow, bottom-left
--bg-glow-secondary slate-blue/0.05       ambient glow, top-right (cool counterweight)

--surface           rgba(24,22,20,0.62)   floating cards (frosted)
--surface-strong    rgba(30,28,26,0.88)   reserved for modals and the detail drawer
--surface-hover     rgba(255,255,255,0.035)

--border            rgba(255,255,255,0.07)   default
--border-strong     rgba(255,255,255,0.12)   emphasis
--border-focus      rgba(240,157,60,0.5)     focused inputs

--text              rgba(255,255,255,0.94)
--text-dim          rgba(255,255,255,0.62)
--text-faint        rgba(255,255,255,0.38)
--text-whisper      rgba(255,255,255,0.22)

--accent            #f09d3c               trail amber (dark theme) — single accent
--accent-soft       rgba(240,157,60,0.16) soft fills, focus rings, active nav
```

Brand color is `#D97A16`. It's used verbatim in the light theme; the dark theme brightens it to `#f09d3c` for legibility on near-black (same pattern as any accent that has to read as text on a dark canvas).

**Single-accent rule, amended for Cairn.** Interaction accent is amber only — nav, focus, buttons, links. But Cairn's core data *is* status, so status hues exist from day one as a closed, semantic set. They are the only other hues allowed in the app:

```
--status-proven     #6fae7b   moss green — quiet, desaturated on purpose
--status-broken     #d4544a   signal red
--status-escalated  #f09d3c   the accent itself — escalation demands attention
--status-draft      --text-dim  (no hue: a draft has no verdict yet)
--status-retired    --text-whisper (no hue: it left the suite)
```

Status color appears **only** at small scale: the `.status-dot`, a thin card edge, a count in `status`. Never as a card background, never as large fills. If a screen feels colorful, it's wrong.

### Typography

- UI / body: **Geist Variable** — distinctive but restrained.
- Mono: **Geist Mono Variable** — ULIDs, proof paths, spec code, run output, commit hashes, kbd. In Cairn the mono voice is load-bearing: everything that is *record* rather than *prose* is mono.
- `letter-spacing: -0.005em` baseline; `-0.012em` on view titles (display-sized text reads tighter).
- `font-feature-settings: "ss01", "cv11"` — open digits matter here (ULIDs, run timestamps).
- Avoid bold on body text; weight range is 350 / 400 / 500.
- Acceptance criteria render at body size with a comfortable measure (~68ch max). They are the most-read text in the app; treat them like an editor treats a paragraph, not like a table cell.

### Radii

```
--radius-card    14px   floating surfaces
--radius-pill    6px    badges, kbd, status chips
items inside cards   10px (slightly less than the card)
```

### Shadow

One shadow recipe for every floating surface:

```
0 1px 0 rgba(255,255,255,0.04) inset,    /* top edge highlight */
0 24px 60px -20px rgba(0,0,0,0.55)       /* long, soft drop */
```

Don't stack multiple shadows. Don't introduce harder shadows.

### Spacing rhythm

Loose, but consistent.

- 24px gutter on the shell
- 8px between a view header and its list
- 14px / 18px paddings inside cards
- 16px above footers and hint rows
- Stone cards in a list: 8px apart; lineage chains: 4px (they read as one object)

## Theme

Two themes share the same accent and the same component layout — only the token table swaps.

- **Dark (default):** `#0c0b0a` base, amber ambient glow, frosted surfaces over warm near-black. Accent brightened to `#f09d3c`.
- **Light (`[data-theme='light']`):** warm off-white `#faf7f2` base (paper, not clinic), the same amber radial glow at lower opacity, white frosted surfaces with a shorter softer drop shadow, accent set to the exact brand `#D97A16`. Status hues darken one step to keep contrast.

Toggling lives in the sidebar foot. State persists in `localStorage` under `cairn.theme`. The read-only proof viewer ships one dark code theme in both app themes — swapping editor themes alongside the body theme is a known gap, same as Taffk.

## Layout

Full-window app shell — a fixed sidebar plus a swappable main view:

```
┌──────────┬───────────────────────────────────┐
│ Sidebar  │  Main view (Review / Cairn /       │
│ 244 px   │   Escalations / Runs)              │
│          │                                    │
│ nav      │   ┌─ view-header ───────────────┐  │
│ repos    │   │ stones…                     │  │
│          │   │                             │  │
│ verify   │   └─────────────────────────────┘  │
│ theme    │                                    │
└──────────┴───────────────────────────────────┘
        + stone detail drawer (right overlay)
```

The sidebar (frosted on `--sidebar-bg`) holds the brand mark, the view nav (**Review / Cairn / Escalations / Runs**), the open-repos list (with "open repo…" — the app has no database; the repo *is* the state), then a foot with the **Verify** launcher and the theme toggle. The main area renders one view at a time inside a single frosted card. Selecting a stone opens the detail drawer as a right-side overlay with a dimmed backdrop (Esc closes it).

View order in the nav mirrors value order: Review first — it is the home screen and the reason the app exists.

## Components

- `.app-shell` — `grid-template-columns: 244px 1fr`, 100vh.
- **Sidebar** — `.nav-item` (with `.active` accent fill and a count badge for Review/Escalations), `.repo-item` (repo name + tiny status summary dots), `.sidebar-foot` (Verify launcher + theme).
- **Review queue** (`.review-view`) — the core screen. One `.review-card` per draft/amendment: intent (body prose), acceptance criteria as a quiet list, `.provenance` (the verbatim request, mono, `--text-faint`, collapsed by default), then three actions: **Approve / Rephrase / Reject**. Approve is the accent button; the other two are ghost. Keyboard-first: j/k to move, a to approve.
- **Cairn view** (`.cairn-view`) — the registry as a timeline/list. `.stone-item`: status dot, title, surface tag, age; filters by status and surface in the `.view-header`. `.lineage` — an amendment chain rendered as vertically linked stones, retired ancestors at `--text-whisper` with a struck dot. The chain is one visual object.
- **Stone detail drawer** — `.detail-drawer` over `.detail-backdrop`. Sections in reading order: intent, acceptance, provenance, proof (`.proof-view`, read-only mono block, never editable here), run history (`.run-row`: date, verdict dot, duration), last failure's Playwright trace/screenshot embedded.
- **Escalations view** — `.escalation-card`: the stone, the warden's structured failure report, the diff, and one honest choice: send back to coder / amend / retire.
- **Runs view** — `.run-log`: live `cairn verify` output, mono, autoscroll with a "follow" toggle. A running verify shows an indeterminate hairline progress bar under the view header — no spinners in cards.
- `.status-dot` — 7px circle, the sole carrier of status hue at list scale. `.status-chip` — pill with dot + label, used in the drawer only.
- `.kbd` — mono, `--radius-pill`, whisper border; the review queue advertises its shortcuts in the hint footer.

## Animation principles

- One entrance animation on the shell. No per-item stagger (yet).
- All hover/focus transitions are 120–200ms, ease.
- No springy / bouncy easings. `cubic-bezier(0.2, 0.8, 0.2, 1)` for entrance, `ease` for state changes.
- The drawer slides in 200ms with the same easing; the backdrop fades.
- Reserve elaborate motion for moments of genuine delight. In Cairn there is exactly one: a stone transitioning to `proven` after a local verify — a single soft amber-to-moss pulse on its dot. Nothing else moves on status change. Never decorate.

## When to break the rules

If you're adding a feature the current system can't express:

- prefer adding a new token to redefining an existing one
- prefer adding a component to overloading an existing one
- prefer extending the radii / spacing scale to one-off values
- never duplicate the amber ambient gradient — it is the canvas signature
- never add a sixth status hue, and never promote status color to fills — if a state needs more emphasis, use placement and type weight, then propose a token in the design discussion
