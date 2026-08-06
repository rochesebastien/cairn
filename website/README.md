# Site vitrine — Cairn

Static landing page for Cairn: `index.html`, `styles.css`, `app.js` and `assets/`. No build
step, no dependency, no CDN — the fonts (Stack Sans Text, Stack Sans Headline, Geist Mono) are
self-hosted under `assets/fonts/`, with their SIL Open Font License alongside.

**Deploy (Vercel).** New project on this repository, framework preset *Other*, **Root Directory =
`website`**, no build command, output directory `.` — `vercel.json` carries the security headers.

**Preview locally.** `cd website && python3 -m http.server 4321` (or `npx serve website`), then open
<http://localhost:4321>.

**Design.** The token table, the radii and the one shadow recipe come verbatim from
[`apps/desktop/DESIGN.md`](../apps/desktop/DESIGN.md): monochrome zinc, a flat canvas, hairline
borders instead of shadows, and status carried by 12px marks rather than colour. Dark is the
default theme and the toggle persists to `localStorage` under `cairn.theme`, the same key as the
app. The brand is `assets/cairn-logo.svg`, the complete lockup — never the glyph beside CSS text;
`assets/cairn-icon.svg` and the favicons are the square-context glyph.
