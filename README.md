# Graphology Analyzer

A privacy-first, browser-based handwriting analysis tool. It accepts a scanned or
photographed handwriting sample, performs client-side image processing and feature
extraction, applies a deterministic, coded graphology rule engine, and produces an
evidence-based, fully traceable report.

**Your handwriting is analyzed locally in your browser and is not stored by this
application.** No handwriting image is ever uploaded to a server or any external AI
service — see [Privacy](#privacy--no-storage-architecture).

## What this is (and isn't)

This app faithfully implements traditional graphology rules and labels them as
graphological interpretations. It is **not** a clinical psychological diagnostic tool.
Graphology's ability to infer personality has not been established as a reliable
clinical/scientific method. Every conclusion in the report is traceable to a measured
observation, a triggered rule, and the exact handwriting region that produced it —
this traceability, not the personality output itself, is the app's core value.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. No environment variables, database, or backend service
are required — this is a static frontend application.

```bash
npm run build   # production build (also runs the TypeScript check)
npm start       # serve the production build
npm run lint    # ESLint
npm test        # Vitest unit tests
```

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it in Vercel as a new project (framework preset: Next.js — auto-detected).
3. No environment variables are required. Deploy.

The app is a pure client-side analysis engine served by Next.js; Vercel Hobby is
sufficient.

## Architecture

```
Image
  → Image Preprocessing        (src/utils/preprocess.ts — rotate/crop/tone/threshold)
  → Handwriting Segmentation   (src/utils/segmentation.ts — lines/words/components)
  → Feature Detection          (src/analysis/features/* — slant, baseline, size, ...)
  → Quality / Confidence       (src/analysis/quality/qualityEngine.ts)
  → Graphology Rule Engine     (src/rules/* — one file per category, engine.ts aggregates)
  → Evidence Aggregation       (rule engine — Evidence[] with regions + rule IDs)
  → Conflict Resolution        (rule engine — same-trait opposing rules → Contradiction[])
  → Personality Synthesis      (rule engine — TraitScore[] with templated synthesis text)
  → Report Generator           (src/report/* — text, PDF, JSON)
```

Key directories:

```
src/
  app/            Next.js routes, global styles (pastel design tokens)
  components/     UI, organized by workflow section (upload, prep, quality, analysis, evidence, report)
  state/          React context holding the end-to-end workflow state
  analysis/       Quality engine + feature extraction pipeline (pure functions, worker-safe)
  analysis/ocr/   Tesseract.js OCR wrapper — separate from the rule-engine pipeline above
  rules/          Graphology rule engine: schema, per-category rule sets, aggregation
  config/         Centralized thresholds — no magic numbers scattered in logic
  utils/          Canvas/image/segmentation/geometry/stats primitives
  workers/        Web Worker entry point that runs the analysis pipeline off the main thread
  report/         Text/PDF export builders
  types/          Shared TypeScript types
  components/formations/  Letter Formations reference library (see below) — independent feature
  state/useFormations.ts  IndexedDB-backed hook behind that library
```

Heavy computation (quality assessment, segmentation, feature extraction, rule
evaluation) runs inside a Web Worker (`src/workers/analysisWorker.ts`) so the UI
thread stays responsive while progress events stream back.

## Feature detectors: what's implemented and how reliable it is

Every detector is explicitly classified as **Reliable**, **Conditionally Reliable**,
**Experimental**, or **Unavailable**, and every measurement carries a confidence score.
Nothing is fabricated: when there isn't enough evidence, the app says so rather than
guessing.

| Feature | Reliability | Notes |
|---|---|---|
| Baseline, Margins | Reliable | Row/column projection profiles + linear regression |
| Slant, Size, Zones | Conditionally reliable | Connected-component geometry (PCA-based angle, bounding boxes) |
| Spacing | Reliable | Word/letter gap statistics from column projections |
| Legibility | Conditionally reliable | Composite of sharpness + size consistency + scan quality |
| Pressure | **Experimental — image-derived proxy** | Not a physical pressure measurement; a scanner cannot capture pen force. Uses ink darkness, density and stroke-width consistency as correlates, with confidence penalized on poor scans. |
| T-bars, I-dots, Ovals | Experimental | Gated by a letter-agnostic shape classifier (below) rather than bounding-box heuristics alone; requires a minimum sample count before any interpretation is offered |
| Letter Shapes (alphabet-level distribution) | Experimental | See below |
| Rhythm & Speed | Experimental | Proxy from stroke continuity + size/spacing variability |
| Signature | Experimental | Conservative last-line heuristic; manual region confirmation is the reliable path |
| Connections, Capital Letters, Punctuation | **Not yet implemented** | The Analysis tabs for these exist and say so honestly rather than showing fabricated results |

### Shape-bucketed gating (not per-letter OCR)

`src/analysis/features/shapeClassifier.ts` classifies every connected ink component into a
letter-*agnostic* geometric bucket, using two real signals:

- **Topology** (`src/utils/topology.ts`): does the stroke enclose a pocket of background —
  a genuine loop/hole detector (flood-fill from the component's bounding-box border; any
  background pixel that can't reach the border without crossing ink is an enclosed loop).
  This is what actually distinguishes a closed "o" from an open "u"-like form, rather than
  a fill-ratio proxy.
- **Zone extension**: does the component reach above/below the line's x-height band
  (ascender/descender), from the existing zone-detection geometry.

Buckets: `dot`, `crossbar_candidate`, `ascender_with_loop`, `ascender_stem`,
`descender_with_loop`, `descender_stem`, `full_span`, `x_height_closed_loop`,
`x_height_open_round`, `x_height_narrow_stem`, `other`.

T-bar, i-dot and oval detection now require a component to fall in the matching bucket
before pairing it with a stem (e.g. a t-bar candidate must be `crossbar_candidate` paired
with an `ascender_stem` — not `ascender_with_loop`, which correctly excludes looped
ascenders like "b"/"l" from being mistaken for "t"). The aggregate bucket counts are also
exposed as their own feature (**Letter Forms** tab → "Letter Shapes"), giving an
alphabet-level census (loop prevalence, stem prevalence, dot/crossbar candidate counts)
that two new rules (`LOOP-PREVALENCE-001`, `STEM-PRECISION-001`) feed into trait scoring.

**This is still not per-letter identification.** The engine knows a component is
loop-bearing and sits within the x-height band; it does not know whether that component is
an "a", "o", "e", "d" or "g" specifically. That requires OCR — see the next section.

## Letter Recognition (OCR)

The **Letter Recognition (OCR)** tab (its own primary tab, separate from Analysis) runs
real optical character recognition via [Tesseract.js](https://github.com/naptha/tesseract.js)
— an actual reading of which letters are present, with per-character bounding boxes and
confidence scores. This is deliberately kept apart from the shape-bucketed Analysis tabs
above, for two reasons:

- **Different question.** Analysis answers "what shape is this stroke" (loop, stem, dot) to
  feed the deterministic graphology rule engine. OCR answers "what letter is this" — a
  different, independent judgment. Conflating the two would let a guess about the letter's
  identity quietly influence trait scoring, undermining the rule engine's determinism and
  auditability.
- **Different reliability model.** OCR confidence comes from a pretrained neural model
  (opaque, not rule-based); the rest of this app is built around fully traceable, auditable
  rules. Keeping OCR in its own tab keeps that boundary honest instead of blending an
  opaque ML confidence score into the rule engine's evidence chain.

What it provides, on demand (it is not run automatically — click "Run OCR on this sample"):

- **Recognized Text**: the full transcription, grouped by line, click any word to highlight
  it on the scan.
- **Per-Letter Detail**: every recognized character with its own OCR confidence.
- **Confidence & Frequency**: a per-letter (a-z) frequency table with mean confidence, useful
  for spotting which letterforms this sample makes hardest to read.

**How it runs, and the one privacy caveat.** Recognition runs 100% client-side via
WebAssembly — the handwriting image is never uploaded anywhere, same guarantee as the rest
of the app. The OCR *engine* itself (the worker script and WASM core) is self-hosted from
`/public/tesseract` for that reason. The one exception: Tesseract's pretrained English
language model (`eng.traineddata`, a few MB) is fetched from Tesseract's own CDN the first
time OCR is run, then cached by the browser — this is the only network request this feature
makes, and it carries no data about you or your image, only a one-way download of the
pretrained model. If that fetch can't complete (offline, a restrictive firewall) within 60
seconds, the tab shows a clear error rather than spinning forever.

**Accuracy caveat.** Tesseract's English model is trained on printed and typed text, not
handwriting; its accuracy on genuinely handwritten samples varies a lot and is generally
lower than on print. Treat low-confidence characters (flagged in red/amber) with real
skepticism rather than as ground truth.

## Letter Formations (personal reference library)

The **Letter Formations** tab is a personal, browser-local reference library for the kind of
graphology "cheat sheet" example you might collect by hand — a picture of a specific letter
formation, paired with the trait it's said to indicate. It has three sub-tabs:

- **Formation Library** (default): the entry form sits in a full-width card at the top of the
  page (wide fields, so longer detail/trait text is readable while typing — not squeezed into a
  narrow sidebar column), and the table of every saved formation fills the full browser width
  below it. Entry fields:
  - **Parameter** — which handwriting-analysis parameter this formation is about, chosen from a
    dropdown of `HANDWRITING_PARAMETERS` (`src/types/formations.ts`): the *same vocabulary* as
    the app's own Analysis tabs (Slant, Size, Pressure, Baseline, Spacing, Margins, Zones,
    Letter Forms, Connections, T-Bars, I-Dots, Ovals, Capitals, Punctuation, Rhythm & Speed,
    Legibility, Signature) — so a formation you save lines up with the same categories the rule
    engine itself measures, rather than an unrelated ad hoc taxonomy. An "Other…" option reveals
    a free-text field for anything that doesn't fit. Below the dropdown, up to 6 **quick-pick
    chips** show your most-used parameters so far (most-used first) — one click sets Parameter
    without opening the dropdown, for the common case of entering several rows about the same
    parameter in a row.
  - **Character** — the specific letter, digit, or punctuation mark this formation illustrates
    (e.g. "t", "y", ","), when the parameter is character-specific (T-Bars, I-Dots, Ovals,
    Letter Forms, Connections, Capitals commonly are). Optional — left blank for whole-writing
    parameters like Slant, Baseline, Margins, Spacing, Pressure, Rhythm, Legibility, Zones, Size
    and Signature, which aren't about any one letter.
  - **Sub-category** — narrower grouping within the parameter, e.g. "Garland", "Angular".
  - **Detail** — free-text description, e.g. "Wavy line — no angles, just curves".
  - **Trait** — the personality trait/aspect it's said to indicate, e.g. "Diplomatic".
  - **Tag** — whether that trait reads **Positive**, **Negative**, or **Medium** (`FORMATION_TAGS`
    in `src/types/formations.ts`), shown as a colored badge in the table (green/red/amber) and
    filterable — a quick way to pull up just the flattering or just the cautionary indicators.
    Optional; unset shows as unspecified rather than defaulting to any one value.

  The table shows all of the above plus an image thumbnail, date added, and Edit/Remove, and
  has its own toolbar above it:
  - A **search box** matching against parameter, character, sub-category, detail, and trait.
  - **Tag filter chips** (All / Positive / Negative / Medium).
  - **Parameter filter chips**, generated from whatever parameters are actually in use.
  - A **Group by** dropdown (None / Parameter / Character / Tag) that renders collapsible group
    headers (click to expand/collapse) instead of one flat list — useful once the library has
    enough rows that scanning it unsorted stops being practical.

  The form stays put and ready after each add (with Parameter/Character/Sub-category/Tag
  retained) so you can add several related rows in a row; each new entry appears at the top of
  the table immediately, right below the form that made it.
- **Trait Index**: the reverse lookup — instead of "what is this formation about," this answers
  "what formations point to trait X." Every distinct trait present in the library gets its own
  collapsible group (a card grid underneath — image, Parameter/Character, detail, Tag badge, and
  a Remove action), sorted alphabetically or by how many formations point to it. Has the same
  search (matches trait text) and Tag filter chips as the Formation Library. This view is
  read-focused — to edit a formation's fields, find it in Formation Library (its search also
  matches trait text) and use Edit there.
- **Backup & Restore**: export/import and automatic-backup controls (see below), as its own tab.

Generating a print-ready book from this library is its own top-level workflow section, **Book /
PDF**, in the main sidebar right below Letter Formations (not a sub-tab of it) — see below.

**Collapsible sidebar.** The workflow sidebar (Upload Sample, Image Preparation, ... Letter
Formations, Book / PDF) has a hamburger (☰) toggle at its top that collapses it to an icon-only
rail — useful for giving the Letter Formations table (or any other wide content) more horizontal
room. The preference persists across reloads in this browser (`src/components/layout/Sidebar.tsx`).

**Parameter/Character split, and what happens to older entries.** Earlier versions of this
feature had a single free-text "Category" field, which in practice often got used as a stand-in
for both at once (e.g. typing "Letter T" as the category to mean "this is about the letter t").
Entries saved that way are normalized automatically, once, the first time they're loaded under
the new schema (`normalizeFormationEntry` in `src/utils/formationsDb.ts`): the old category text
becomes the new `parameter` value verbatim (so nothing is lost, even if it doesn't match the
controlled vocabulary above — it just shows up as a selectable value on that row until you
edit it), and if that text matches the "Letter X" pattern, the letter is pulled out into the new
`character` field as a one-time helpful backfill. Use Edit on those rows afterward to reassign
them to a proper Parameter/Character/Sub-category combination if you want them fully conformant.

**Incomplete entries are fine.** You don't need every field to save a row — add just a trait
you want to remember, or just an image with no detail yet, and fill in the rest later. The
only requirement is that at least one field or the image isn't blank (a fully empty row is
rejected).

**Inline editing.** Click **Edit** on any row to edit its parameter, character, sub-category,
detail, and trait in place, and to replace or clear its image — the image cell becomes the same
drag-drop/upload/paste picker used when adding. **Save** commits the change immediately (into
IndexedDB and, if connected, the auto-backup file); **Cancel** discards it. The "Added" date
is shown as dd-mm-yyyy.

**Paste from clipboard.** Every image picker in the app — the main handwriting sample upload,
and every Formation image field (adding a new one or editing an existing one's image) — accepts
a pasted image in addition to drag-and-drop and click-to-browse. Click or Tab into the drop
area first (so it has focus), then Ctrl/Cmd+V.

**Crop &amp; Highlight.** Once an image is picked/dropped/pasted (adding a new formation, or
editing an existing one's image), a **✂ Crop / Highlight** link appears under it, opening an
editor (`src/components/formations/ImageAnnotator.tsx`) with two tools:
- **Crop** — drag a box over the part worth keeping, then Apply Crop, to trim the image down to
  the relevant part of the sample.
- **Highlight** — drag a box over exactly what the Detail field describes, then Add Highlight; a
  semi-transparent amber fill (no border) is drawn *permanently onto the saved image's pixels* at
  full resolution marking that spot, so reviewing the row later shows exactly what was meant
  instead of requiring you to re-read the Detail text and guess which part of the image it refers
  to.

The working view is a resizable box (drag its bottom-right corner) rather than a fixed size — the
image always scales to fit it proportionately, so enlarging the box gives a bigger, more precise
view for marking without ever stretching or distorting the image.

**Reset to Original** undoes both back to the untouched picked image. **Use This Image** flattens
crop + highlight into a single JPEG and hands it back to the same upload path as any other
picked/dropped/pasted file — no separate "annotated image" concept or extra storage field; the
annotated image simply *is* the formation's image from that point on.

**Auto-expanding text fields.** Character, Sub-category, Detail, and Trait — in both the entry
form and inline row editing — grow taller as their content wraps past one line, so editing never
hides existing text behind a fixed-height box.

**Book / PDF export (KDP-ready).** Its own top-level sidebar section (not a Letter Formations
sub-tab — `src/components/formations/BookExportTab.tsx`, building on `src/report/bookPdfBuilder.ts`
and `src/report/formationsBookPdf.ts`), so it's reachable without drilling into the library first.
It turns the library into a paperback interior file sized for Amazon KDP's 6&times;9in trim:

- **Chapter grouping** — a multi-select: click **Parameter**, **Trait**, and/or **Character** to
  toggle each on or off (at least one always stays selected). A chapter is then built per unique
  combination of whichever are selected — e.g. Parameter alone gives one chapter per parameter;
  Parameter + Character gives one chapter per parameter/character pair. Whichever of Parameter,
  Character, or Sub-category *isn't* part of the chapter combination still gets grouped for
  display within each chapter: a small sub-heading appears only when that combination changes
  between consecutive entries, so a run of similar formations isn't re-captioned on every page.
  Entries missing a selected field land in a trailing "(No … set)" chapter rather than being
  dropped.
- **Page layout** — **Continuous** (default): entries flow down each page, several per page where
  they fit, for a compact reference layout with tightened inter-entry spacing. **One per page**:
  every formation starts a fresh page instead, trading page count for more white space per entry.
  Either way, each entry is three columns — **image** on the left, **Detail** (the primary,
  readable text) in the middle, and the **Trait** as a short italic tagline on the right (no
  "Trait:" label — just the trait itself), with a small Tag line above it. Detail and Trait share
  one uniform body text size rather than one being visually dominant over the other, and all
  three columns are vertically centered against whichever is tallest, so a short entry next to a
  comparatively tall image doesn't look top-anchored and lopsided. Column widths are fixed
  regardless of the Image size setting below — only how large an image is allowed to print
  *within* its own column changes with that slider, so Detail stays anchored as the visual center
  column instead of the whole layout shifting as the image grows.
- **Image size** — a 50%-250% slider (default 100%). At 100%, an image is only ever scaled *down*
  to fit its column, never upscaled past its native resolution, so a low-resolution source stays
  sharp but prints smaller. Above 100% the builder will deliberately upscale a small image to
  print larger within that same fixed column — the app no longer silently refuses to do this; a
  **preview** (see below) is where you judge whether the resulting softness is acceptable.
  Formation images are also now stored at up to 1200px (`MAX_FORMATION_IMAGE_DIM` in
  `src/state/useFormations.ts`, raised from the original 400px) so newly saved entries have more
  real pixels to work with in the first place — existing lower-resolution entries aren't
  retroactively upscaled in storage, so re-adding a sharper source image via Edit is worth doing
  for older entries destined for print.
- **Preview before downloading** — clicking **Preview PDF** builds the document and opens it in an
  in-page viewer instead of downloading immediately; **Download PDF** inside that preview saves
  the exact file you just looked at, or **Close** to adjust settings and regenerate.
- **Entry filter** — **Complete entries only** (has an image, detail, and trait — every printed
  page carries real content), **Has an image** (detail/trait optional), or **All entries**. Live
  counts next to each option update from the current library so you can see what you'll get
  before generating.
- **Front/back cover art and ISBN barcode (all optional)** — browse or drag-and-drop an image for
  front cover, back cover, and/or an ISBN barcode. Front/back cover, if provided, is embedded as
  its own full page (front first, back last), fitted to the 6&times;9in trim without cropping. The
  barcode, if provided, is overlaid in the bottom-right corner of the back cover (the conventional
  spot) — or shown on the copyright page as a fallback if there's no back cover. Sizing and
  print-readiness of anything uploaded here (bleed, resolution, trim marks, barcode scannability,
  etc.) is left entirely to you — the app only embeds what's uploaded, no validation.
- **ISBN, Edition, and copyright year** — an optional ISBN text field (shown on the copyright page
  verbatim, or a "[Add your ISBN here before publishing]" placeholder if left blank), optional
  Edition text (e.g. "First Edition") shown on the title page, and a Copyright year field
  defaulting to the current year — all feeding the title/copyright pages.
- The PDF itself: a title page and a copyright page, a **Table of Contents** whose page length is
  reserved to fit the actual chapter list and whose *entire row* (not just the title text) is
  hyperlinked to that chapter, a running header on every chapter page (chapter title, plus a
  **Contents** link back to that chapter's own Contents row), and an alphabetical **Index by
  Trait** and **Index by Character** — placed right after the Table of Contents (not at the very
  end), each entire row hyperlinked (the term and its leader dots jump to the first page it
  appears on; every individual page number, for a term that appears more than once, is also
  separately clickable to that specific page). Getting the index to appear before the chapters it
  points into takes two internal render passes — the first learns which page every trait/
  character lands on, the second draws the real document with the index positioned up front and
  every page number shifted to account for the index's own length — invisible to you, but worth
  knowing if you're reading `src/report/formationsBookPdf.ts`. Left/right margins mirror by page
  (inner "gutter" vs. outer edge) so the text block
  sits centered once bound; the gutter is sized generously enough to stay within KDP's minimum at
  any realistic page count, so double-check it against KDP's current requirement for your book's
  actual final page count before uploading.
- All PDF construction happens client-side in the browser (jsPDF), same as the existing Analysis
  report — nothing is uploaded anywhere to generate or preview it.

**Where the data lives.** Entries (including the images, downscaled to keep storage light)
are saved to this browser's **IndexedDB** (`src/utils/formationsDb.ts`), not to any server —
consistent with the rest of the app's no-backend architecture, but unlike the analyzed
handwriting sample, this library is *intentionally* persisted across sessions/reloads so it
can be built up over time. IndexedDB was chosen over `localStorage` (used in an earlier
version) specifically because its quota is typically hundreds of MB or more — practically
unbounded at any realistic library size — versus localStorage's ~5-10MB ceiling, which a
library of embedded images would eventually hit; any formations saved under the old
localStorage-based version are migrated over automatically and silently the first time this
loads after the update (`migrateFromLocalStorage` in `formationsDb.ts`), then the old copy is
removed once the migration succeeds. Clearing your browser's site data for this app still
removes it, which is exactly why backup exists (see below).

**Backup &amp; restore.** Its own sub-tab (`src/state/useFormations.ts` backs both sub-tabs):

- **Export as JSON** / **Import from JSON** — always available, in every browser. Export
  downloads the whole library (images included, as data URLs) as one `.json` file; Import
  reads one back, either **merging** it into what's already here (default — any id collision
  is re-issued a new id so nothing existing is overwritten) or **replacing** the library
  outright (checkbox next to Import).
- **Export as CSV** / **Import from CSV** — covers text fields only (parameter, character,
  sub-category, detail, trait, tag); images aren't included, so add them afterward via Edit if
  needed. Import accepts a header row naming any of those columns, in any order and
  case-insensitively (also recognizing `category` for parameter and `char` for character), skips
  blank rows, and merges/replaces the same way JSON import does. Handy for bulk-editing entries
  in a spreadsheet.
- **Duplicate detection on import** — before writing anything, an import (JSON or CSV) is checked
  for exact content duplicates: parameter, character, sub-category, detail, trait, tag, and image
  all identical (id/createdAt are expected to differ and are ignored). This catches both entries
  that repeat something already in the library (relevant for merge mode) and entries that repeat
  each other within the file itself. If any are found, a dialog reports the counts and asks
  before doing anything — **skip duplicates and import the rest** (default), **import everything
  anyway**, or **cancel** — rather than silently re-issuing new ids for id collisions the way a
  naive merge would (which is how re-importing an overlapping backup used to create silent
  duplicates). A clean import with no duplicates proceeds without any extra prompt.
- **Check Library for Duplicates** — the same exact-content-duplicate definition, applied to
  what's already saved rather than an incoming file. Click the button to scan; if any duplicate
  groups are found, a dialog lists them (which parameter/character, how many copies, and the date
  of the copy that would be kept — the oldest one in each group) and asks for confirmation before
  removing anything. Nothing is deleted on a scan alone, and a clean library reports "No
  duplicates found" with no further prompt.
- **Automatic backup to a file on disk** — in Chromium-based browsers (Chrome, Edge) that
  support the File System Access API, "Connect a backup file…" opens a native save dialog
  once; after that, every add or remove is written to that same file automatically (debounced
  ~800ms after the last change), with no further prompts, for as long as the browser's
  permission grant lasts. The chosen file's handle is kept in IndexedDB (`src/utils/fileHandleStore.ts`)
  so the connection survives a reload; if the browser later revokes the write permission (this
  varies by browser and can happen after a restart), the card shows "needs reconnecting" with a
  one-click Reconnect button rather than silently failing. In browsers without this API (Firefox,
  Safari as of this writing), the card says so and Export/Import is the supported path — doing a
  manual Export after a session where you added several formations is the reliable equivalent.

Both paths write the same JSON shape, so a file saved by auto-backup can also be restored via
Import, and vice versa.

**Periodic backup reminder.** While there are changes (an add, edit, or remove) that haven't
been exported or auto-backed-up yet, a popup prompts you to back up, with **Export now** or
**Continue without saving** (dismiss and get asked again next interval if still unsaved). The
interval is **15 minutes** normally, or **30 minutes** once an automatic backup file is
connected (see above) — less urgent nagging since changes are already being written there.
This is a nudge, not a data-loss warning — every change is already saved to IndexedDB
immediately; the reminder is only about the external-backup safety net described above.

**Not wired into the rule engine.** This is a reference library you curate, not an input to
the automated analysis — entries here do not feed the graphology rule engine, trait scoring,
or any Analysis tab. It's deliberately kept that way so the deterministic rule engine's
evidence chain isn't affected by informal, unvalidated entries. Using it to manually cross-
check or extend the app's rule library is a natural next step, not yet built.

## Privacy / no-storage architecture

- Handwriting images are loaded as in-memory `File`/`Canvas`/`ImageData` objects and
  never leave the browser.
- There is no backend API route, database, or file storage in this application.
- The only network requests the app makes are for its own static assets, Google Fonts,
  and — only if you use the Letter Recognition (OCR) tab — a one-time download of
  Tesseract's pretrained language model from its CDN (see "Letter Recognition (OCR)").
  No handwriting pixel data is ever part of any network request.
- The JSON report export deliberately excludes raw image bytes — only normalized
  region coordinates (0–1 fractions) and measurements are included.
- Closing or refreshing the tab releases all in-memory image data for the analyzed
  handwriting sample; nothing about that sample persists across sessions. The one
  exception is the separate, opt-in **Letter Formations** library (see below), which
  intentionally persists in this browser's IndexedDB since it's a personal reference
  collection you build up over time, not analysis input.

## Rule engine

Rules live under `src/rules/<category>/index.ts`. Each rule has a stable ID (e.g.
`SLANT-RIGHT-001`), a base weight, one or more trait effects, and an `evaluate()`
function that reads measured features and returns a match (or `null`). The engine
(`src/rules/engine.ts`) computes an **effective weight** per spec:

```
effective_weight = rule_weight × observation_confidence × sample_sufficiency × image_quality
```

and only lets a rule fire above `CONFIDENCE_THRESHOLDS.MIN_RULE_ACTIVATION_CONFIDENCE`
/ `MIN_EFFECTIVE_WEIGHT` (see `src/config/thresholds.ts`). Traits with contributions
from both directions (e.g. some evidence pushing higher, some lower) are flagged as
**contradictions** with a synthesized reconciliation sentence rather than being
silently averaged away.

## Fully automatic pipeline — no button presses

Uploading a sample is the only action needed. `loadFile` in `src/state/workflowStore.tsx`
runs the entire pipeline itself the moment a file is chosen or pasted: auto-tuning Tone &
Clarity (if enabled, on by default), scan-quality assessment, and the full
feature-extraction/rule-engine pass, landing you on the **Analysis** tab with Personality
Profile, Evidence & Rules and Report all populated — no "Continue to Scan Quality" or
"Accept & Analyze" click required. Those buttons still exist (Image Preparation and Scan
Quality remain fully browsable/adjustable) for re-running deliberately after you tweak
something, but they're no longer gates you have to clear to see a result.

The one deliberate exception is **Letter Recognition (OCR)** (see above): it stays a manual
"Run OCR" click, since running it fetches Tesseract's language model from an external CDN on
first use — a network request the app doesn't make without explicit action, consistent with
the privacy note on that tab.

## Live re-analysis

Scan quality assessment, feature extraction and rule evaluation run together as one
continuous pass in the Web Worker (`runFullAnalysis` in `src/state/workflowStore.tsx`) —
there's no separate staged wait between steps once it starts.

Since upload already triggers the first full pass automatically (see above), any further
change on the **Image Preparation**
tab (rotate, crop, brightness, threshold, etc.) automatically reschedules that same
pass: it waits for a short, configurable debounce (default **0.2s**, adjustable via the
"Live update delay" slider on that tab, 0.05s–1.5s) after your last change, then reruns
quality assessment + analysis in the background. The previously computed report stays
visible the whole time — Analysis, Personality Profile and Report all show a small
"Recalculating…" badge while this happens, but never block or reset to a wait screen —
and swaps in the new numbers once ready. The Image Preparation tab itself shows the
live analysis confidence with a trend indicator (▲/▼ and the point delta) so you can see
immediately whether a change you just made improved or hurt overall confidence.

### Auto-correct for maximum confidence

The Preparation tab's **Tone & Clarity** card has an "Auto-correct for maximum
confidence" checkbox (default checked). When enabled it runs automatically as soon as a
sample is uploaded — and on demand via "Re-run auto-tune now" — performing a coordinate-
ascent local search (`src/utils/autoTune.ts`) over brightness, contrast, sharpen, noise
reduction, grayscale and background normalization, evaluating each candidate against the
real scan-quality composite score (`assessScanQuality`, at a smaller 700px search
resolution so it stays fast) and keeping whichever combination scores highest. It's a
one-pass local search over a coarse grid, not an exhaustive or globally optimal one —
labeled as such in the UI — and it deliberately leaves rotation, crop, deskew and
threshold alone, since those are geometry/binarization choices rather than "tone".

Once a first analysis has run, both "Re-run auto-tune now" and toggling the checkbox
back on report a **before → after** comparison — the real `overallConfidence` from a
full re-analysis, not just the scan-quality proxy the search itself optimizes — shown
both in the Tone & Clarity card and in the Live Analysis card. Before that first
analysis, the same comparison is shown using the scan-quality score alone (labeled as
such), since there's no full-pipeline confidence yet to compare.

## Evidence traceability: click a rule, see the ink

Every triggered rule and every evidence-table row is clickable (`RuleChip`,
`src/components/ui/RuleChip.tsx`). Clicking a rule ID anywhere in the app — a chip
under a Personality Profile trait, a "Rules Triggered" entry on an Analysis tab, a row
in the Evidence table, or an entry in Rule Activations — jumps to **Evidence & Rules**
and highlights every handwriting region that rule actually used, as a light-grey overlay
box on the scan (`src/state/workflowStore.tsx`'s `highlightedRuleId` /
`goToRuleEvidence`). Every feature extractor attaches representative region(s) to its
`Observation` (word/line bounding boxes for spacing, component bounding boxes for
size/margins/zones/pressure/legibility/rhythm, unioned bar+stem boxes for t-bars and
i-dots, component boxes for ovals), and each rule forwards `observation.regions` as its
own evidence regions — so "what part of the handwriting produced this" is answerable for
essentially every rule, not just slant/baseline.

Per-extractor region sample caps were raised from ~5 to ~10, and the rule engine
(`src/rules/engine.ts`) now emits **one evidence entry per region** instead of bundling
every region for a rule into a single row — a rule matched against 6 words produces 6
individually clickable evidence rows (labeled "sample 1/6", "sample 2/6", ...), not one
row with 6 boxes lumped together. The Analysis dashboard reflects this: "Rules
Triggered" and "Features Analyzed" show **N / total** against the full rule library and
feature list, and "Evidence Entries" / "Regions Highlighted" report the (now larger)
row and region counts directly.

## PDF report

`npm`'s `jspdf` + `jspdf-autotable` build a properly paginated PDF
(`src/report/pdfBuilder.ts` + `src/report/pdfExport.ts`):

- A clean cover page (title, sample info, embedded preview image, key stats, privacy
  note) — no running header/footer clutter.
- A dedicated, hyperlinked **Table of Contents** page: every section title is a
  clickable link to its first page.
- A running header (report title + current section name) and footer (**Page X of N**)
  on every content page.
- An **Index** link in the header of every content page that returns not just to the
  Contents page, but to the exact line for that section (`/XYZ` destination with the
  TOC row's y-position) — click Index from deep in the Evidence table and you land back
  on that section's own TOC row, not the top of the page.
- Tables (Component Averages, Feature Readiness, Observed Characteristics, Rule
  Activations, Handwriting Portions Used) render via `jspdf-autotable` with repeated
  headers and automatic pagination; trait cards and callouts (Contradictions,
  Limitations, Disclaimer) use hand-rolled rounded-rect primitives in the same pastel
  accent palette as the app, not the browser's default black-and-white print output.

The Report tab has a **"Show calculations"** checkbox (default checked) next to the
export buttons. Checked, the Rule Activations section (on-screen, in the copied text
report, and in the exported PDF) shows the full `weight × confidence × sufficiency ×
quality = effective weight` breakdown behind every rule's contribution; unchecked, it
collapses to a single "Contribution: N" figure for readers who just want the bottom
line. The toggle is threaded through `buildTextReport`'s and `exportReportToPdf`'s
options so Copy Report, Print and Export PDF all match what's on screen.

## Testing

`npm test` runs Vitest unit tests covering:

- statistics helpers (mean/median/stddev)
- sample-sufficiency scaling
- rule activation (fires with sufficient confident evidence, does not fire with too
  few samples or too-low confidence, degrades under poor scan quality)
- contradiction detection between opposing same-trait rules

## Known limitations

- The Letter Recognition (OCR) tab's output is not integrated into the graphology rule
  engine or trait scoring — it's a separate, independent view (see "Letter Recognition
  (OCR)" below for why). It also needs a one-time internet connection to fetch the
  language model; it will not work fully offline on first use.
- PDF page rendering for uploaded PDF samples is not implemented in this release;
  JPG/PNG/WebP are supported.
- Letter-connection style, capital-letter-specific and punctuation-specific detectors
  are not implemented yet (honestly labeled as such in the UI).
- The threshold values in `src/config/thresholds.ts` are reasonable engineering
  defaults, not the output of a validated psychometric calibration study — see spec
  §53 Phase 7 for the intended calibration process against real samples.
- Zoom/Pan in the preparation workspace are viewing aids only (CSS-level); Rotate and
  Crop are the transforms that affect analysis.

## Disclaimer

This application presents graphological interpretations based on traditional
graphology literature and a deterministic, auditable rule engine. It is not a
clinical psychological diagnosis and should not be used for employment, credit,
insurance, legal, medical, or psychiatric decisions.
