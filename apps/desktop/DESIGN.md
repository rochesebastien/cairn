# DESIGN.md

Visual identity for the Cairn desktop app (and the showcase site, which follows the same token table).

## Direction

**Monochrome, structural, quiet.** The reference points are shadcn/ui and Linear: a neutral canvas, hairline borders doing the work that shadows and glows used to do, and type carrying the hierarchy. Nothing on screen is decorative.

There is **no brand hue**. The interface is black, white, and the greys between them. Where something must stand out, it stands out by contrast, weight, or placement — never by colour. This is a deliberate reversal of the earlier amber direction: a tool that a developer keeps open all day should recede, and the only thing allowed to be loud is the user's own words.

Cairn is a *reading* app before anything else. Every layout decision optimizes for reading intent quickly — generous measure, calm hierarchy, nothing competing with the text. The pitch of the UI is not "watch tests go green", it is: **do these stones describe what I wanted?**

## What we are NOT

- No brand colour, no accent hue, no gradient. If you are reaching for a colour, you are solving the wrong problem.
- No ambient glow, no frosted glass, no backdrop blur. The canvas is flat.
- No Inter/Roboto default look, no "AI dashboard" template, no neumorphism.
- No traffic-light dashboard. A wall of coloured tiles is exactly the failure mode.
- No scattered micro-interactions (button bounces, input wiggles).

## Tokens

Defined in `src/app.css`. Use the variables; never hardcode. The scale is neutral zinc — no hue, no temperature.

### Color

**Dark (default)**

```
--bg-base           #09090b   page canvas, flat
--surface           #0c0c0e   cards and panels
--surface-strong    #121215   modals, the detail drawer
--surface-hover     rgba(255,255,255,0.04)
--surface-active    rgba(255,255,255,0.07)

--border            #1f1f23   default hairline
--border-strong     #2e2e33   emphasis, focused card edge
--ring              rgba(255,255,255,0.30)   focus ring

--text              #fafafa
--text-dim          #a1a1aa
--text-faint        #71717a
--text-whisper      #52525b

--accent            #fafafa   the interactive colour IS white
--accent-fg         #09090b   text on top of an accent fill
--accent-hover      #e4e4e7
--accent-soft       rgba(255,255,255,0.08)   active nav, soft fills
```

**Light (`[data-theme='light']`)**

```
--bg-base           #ffffff
--surface           #ffffff
--surface-strong    #ffffff
--surface-hover     rgba(9,9,11,0.04)
--surface-active    rgba(9,9,11,0.07)

--border            #e4e4e7
--border-strong     #d4d4d8
--ring              rgba(9,9,11,0.30)

--text              #09090b
--text-dim          #52525b
--text-faint        #71717a
--text-whisper      #a1a1aa

--accent            #18181b   the interactive colour IS near-black
--accent-fg         #fafafa
--accent-hover      #27272a
--accent-soft       rgba(9,9,11,0.06)
```

Both themes share one rule: **the accent is the opposite end of the greyscale from the canvas.** A primary button is a solid block of `--accent` with `--accent-fg` text. Everything else is ghost or outline.

### Status, without colour

Cairn's core data is status, and status must stay readable in a palette that has no hues. Status is carried by **shape and weight, not colour** — a 12px monochrome glyph (`.status-mark`), not a coloured dot:

| Status | Glyph | Treatment |
| --- | --- | --- |
| `draft` | dashed circle | `--text-faint` — no verdict yet |
| `proven` | filled circle with a check | `--text` — full contrast, it is the good state |
| `broken` | circle with a cross | `--text`, plus a 2px `--border-strong` left edge on the row |
| `escalated` | flag | `--text`, plus the row keeps its left edge — it is a queue |
| `retired` | struck circle | `--text-whisper` — it left the suite |

A status glyph is always paired with a text label wherever the space allows (drawer, chips, filters). Never rely on shape alone in a dense list — the label is not optional decoration, it is the fallback.

> If a hue is ever reintroduced (a `--destructive` red for `broken`, in shadcn's sense), it is a single token, used only on the glyph and never on a fill — and it is a design decision to be taken explicitly, not a drift.

### Typography

- UI / body: **Stack Sans Text** (`'Stack Sans Text Variable'`) — Regular 400, `letter-spacing: -0.04em`. Self-hosted, no CDN.
- Titles: **Stack Sans Headline** (`'Stack Sans Headline Variable'`) — Bold 700, `letter-spacing: -0.02em`. Brand name, view titles, stone/review/drawer titles — anything that *names* a thing, never a field label.
- Mono: **Geist Mono Variable** — ULIDs, proof paths, spec code, run output, commit hashes, kbd. The mono voice is load-bearing: everything that is *record* rather than *prose* is mono. Keeps `font-feature-settings: 'ss01', 'cv11'`.
- Body stays Regular; bold belongs to Headline titles. Emphasis inside body copy is colour-step (`--text` vs `--text-dim`), not weight.
- Acceptance criteria render at body size with a ~68ch measure. They are the most-read text in the app; treat them like an editor treats a paragraph, not like a table cell.

### Radii

```
--radius-card    12px   cards, panels, the drawer
--radius         8px    buttons, inputs, items inside cards
--radius-pill    6px    chips, badges, kbd
```

### Elevation

Borders carry structure; shadows are nearly absent. **One recipe per theme, and only on genuinely floating surfaces** (the drawer, modals, popovers):

```
dark:   0 16px 40px -24px rgba(0,0,0,0.80)
light:  0 1px 2px rgba(9,9,11,0.06), 0 8px 24px -12px rgba(9,9,11,0.10)
```

Cards in a list get **no shadow at all** — a `1px solid var(--border)` is the whole treatment. Do not stack shadows. Do not add a second, harder recipe.

### Spacing rhythm

Loose, but consistent.

- 24px gutter on the shell
- 8px between a view header and its list
- 14px / 18px paddings inside cards
- 16px above footers and hint rows
- Stone cards in a list: 8px apart; lineage chains: 4px (they read as one object)

## Brand

The logo is `assets/cairn-logo.svg` — **the stone glyph and the "Cairn" wordmark together, as one lockup**. Use the complete lockup wherever the product is named: the sidebar head, the site nav, the site footer. Do not rebuild the wordmark in CSS text next to the glyph, and do not ship the glyph alone as if it were the logo.

`assets/cairn-icon.svg` — the glyph alone — is reserved for square contexts where a lockup cannot fit: app icons, favicons, avatars.

Both files are solid black artwork on transparency. On the dark theme they render white via `filter: invert(1)`; on the light theme they render as-is. That is the only filter allowed on brand assets — never recolour them, never add a drop shadow.

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

The sidebar holds the **full logo lockup**, the view nav (**Review / Cairn / Escalations / Runs**), the open-repos list ("open repo…" — the app has no database; the repo *is* the state), then a foot with the **Verify** launcher and the theme toggle. The sidebar sits on `--bg-base` with a single `border-right`; it is not a tinted panel. The main area renders one view at a time inside a bordered card. Selecting a stone opens the detail drawer as a right-side overlay with a dimmed backdrop (Esc closes it).

View order mirrors value order: Review first — it is the home screen and the reason the app exists.

## Components

- `.app-shell` — `grid-template-columns: 244px 1fr`, 100vh.
- **Sidebar** — `.brand-logo` (the lockup image, ~104px wide, inverted on dark), `.nav-item` (`.active` = `--surface-active` fill + `--text`, inactive = `--text-dim`; count badge for Review/Escalations), `.repo-item`, `.sidebar-foot` (Verify + theme toggle).
- **Review queue** (`.review-view`) — the core screen. One `.review-card` per draft: intent prose, acceptance criteria as a quiet list, `.provenance` (verbatim request, mono, `--text-faint`, collapsed), then **Approve** (solid accent) / Rephrase / Reject (ghost). The focused card is marked by a `--border-strong` edge, not a colour. Keyboard-first: j/k to move, a to approve.
- **Cairn view** (`.cairn-view`) — registry list. `.stone-item`: status mark, title, surface tag, age; filters by status and surface in the `.view-header`. `.lineage` — an amendment chain as vertically linked stones, retired ancestors at `--text-whisper`. The chain is one visual object.
- **Stone detail drawer** — `.detail-drawer` over `.detail-backdrop`. Reading order: intent, acceptance, provenance, proof (`.proof-view`, read-only mono, never editable here), run history, last-failure trace.
- **Escalations** — `.escalation-card`: stone + the warden's structured failure report + diff, and one honest choice: send back to coder / amend / retire.
- **Runs** — `.run-log`: live `cairn verify` output, mono, autoscroll with a follow toggle. A running verify shows an indeterminate hairline bar under the view header — no spinners in cards.
- `.status-mark` — the 12px monochrome glyph set above. `.status-chip` — pill with glyph + label, drawer only.
- `.kbd` — mono, `--radius-pill`, `--border` outline.

## Animation

- One entrance animation on the shell. No per-item stagger.
- Hover/focus transitions 120–200ms, `ease`. Entrance `cubic-bezier(0.2, 0.8, 0.2, 1)`. Drawer slides 200ms, backdrop fades.
- No springy or bouncy easings.
- One moment of delight, and only one: a stone reaching `proven` after a local verify gets a single soft opacity pulse on its status mark. Nothing else moves on status change. Never decorate.

## When to break the rules

- prefer adding a token to redefining an existing one
- prefer adding a component to overloading an existing one
- prefer extending the radii/spacing scale to one-off values
- **never introduce a hue without an explicit design decision** — not for a status, not for a highlight, not "just for this one badge". Monochrome is the identity, not a phase.
- never rebuild the wordmark in text beside the glyph — ship the lockup
