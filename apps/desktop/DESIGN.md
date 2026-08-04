# DESIGN.md

Visual identity for the Cairn desktop app (and the showcase site, which follows the same token table).

## Direction

**Monochrome, structural, quiet.** The reference points are shadcn/ui and Linear: a neutral canvas, hairline borders doing the work that shadows and glows used to do, and type carrying the hierarchy. Nothing on screen is decorative.

There is **no brand hue**. The interface is black, white, and the greys between them. Where something must stand out, it stands out by contrast, weight, or placement — never by colour. The one exception is a stone's status, which gets three fixed hues at glyph scale (see *Status* below); everything else stays on the greyscale. This is a deliberate reversal of the earlier amber direction: a tool that a developer keeps open all day should recede, and the only thing allowed to be loud is the user's own words.

Cairn is a *reading* app before anything else. Every layout decision optimizes for reading intent quickly — generous measure, calm hierarchy, nothing competing with the text. The pitch of the UI is not "watch tests go green", it is: **do these stones describe what I wanted?**

## What we are NOT

- No brand colour, no accent hue, no gradient. If you are reaching for a colour for anything other than a stone's status, you are solving the wrong problem.
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

### Status — the one place colour is allowed

The interface is monochrome. **Status is the single, deliberate exception**, because it is Cairn's core data and a verdict has to be readable at a glance. Three hues, fixed, and no fourth:

```
--status-proven      #438440   rgb(67, 132, 64)    green
--status-broken      #E9484C   rgb(233, 72, 76)    red
--status-escalated   #E99A3F   rgb(233, 154, 63)   orange — waiting on a human
```

Used verbatim in both themes. `draft` and `retired` take **no hue** — a draft carries no verdict yet, and a retired stone left the suite; both stay on the greyscale.

Status is carried by a 12px glyph (`.status-mark`) whose **shape and colour agree**, so neither one alone is load-bearing:

| Status | Glyph | Colour |
| --- | --- | --- |
| `draft` | dashed circle | `--text-faint` |
| `proven` | filled circle with a check | `--status-proven` |
| `broken` | circle with a cross | `--status-broken` |
| `escalated` | flag | `--status-escalated` |
| `retired` | struck circle | `--text-whisper` |

**Scale discipline is what keeps this from becoming a dashboard.** Colour appears only on the glyph itself, on a `.status-chip`'s glyph, and on a 2px row edge for `broken` and `escalated`. It never becomes a card background, a button, or a text colour for body copy.

Two **record surfaces** carry the same hues as an explicit exception, because there the verdict *is* the content and the terminal convention is older than this design system: the diff in Escalations (`+` green, `−` red) and the pass/fail lines of the run log. The home heatmap is the third and last — see below. Nothing else. A glyph is still paired with its text label wherever the space allows — colour is reinforcement, not the only signal, and it must survive a colour-blind reader.

Everything outside this table stays monochrome. Adding a fourth hue, or promoting one of these three to a fill, is a design decision to be taken explicitly — not a drift.

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

`assets/cairn-icon.svg` — the glyph alone — is reserved for square contexts where a lockup cannot fit: app icons, favicons, avatars, and the home screen, where it is deliberately huge (`min(42vh, 460px)`) and the wordmark would only crowd it.

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

**Home is what the app opens on**, with no nav item selected: the glyph alone at close to half the window height, floating in the space above a full-width year of proof runs. Nothing else — no title, no counts line; the sidebar already names the product and the heatmap's own caption says what is being counted. Clicking the sidebar lockup returns there. It answers one question — *has this cairn been kept up?* — and answers it as a shape you read in a second, not a table.

By default it reads **every open repository**, over the **current calendar year**. Two dropdowns at the top right of the card narrow it: project (all, or one) and year (only years that actually hold runs).

The **heatmap** is the one large coloured surface in the product, and it is the third record-surface exception. Alpha carries volume (four steps against the busiest day); hue carries the day's success rate: **≥ 90 % green, 60–90 % orange, below that red**, empty days on the greyscale. The thresholds are the point — "any red at all" would paint nearly every busy day red and say nothing, because one failing proof out of nine is weather, not a bad day. Hovering a tile opens a hover card with the day, the number of proofs replayed, and the passed/failed split as both a percentage and a count.

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
- **never introduce a hue outside the three status colours** — not for a highlight, not for a CTA, not "just for this one badge". Monochrome plus a three-colour verdict is the identity, not a phase.
- never rebuild the wordmark in text beside the glyph — ship the lockup
