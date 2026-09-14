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
  state/useFormations.ts  localStorage-backed hook behind that library
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
formation, paired with the trait it's said to indicate. It has two sub-tabs:

- **Formation Library** (default): a two-column layout — the entry form sits in a left column
  next to the workflow sidebar (upload an image, then fill in a **category**, a broad grouping
  e.g. "Letter connections"; a **sub-category**, narrower within it, e.g. "Garland"; a
  **detail** describing the formation, e.g. "Wavy line — no angles, just curves"; and the
  **trait** it's said to indicate, e.g. "Diplomatic"), and the table of every saved formation —
  image thumbnail, category, sub-category, detail, trait, date added, and Edit/Remove — fills
  the rest of the page to its right. The form stays put and ready after each add (with
  category/sub-category retained) so you can add several related rows in a row; each new entry
  appears at the top of the table immediately, right next to the form that made it.
- **Backup & Restore**: export/import and automatic-backup controls (see below), as its own tab.

**Incomplete entries are fine.** You don't need every field to save a row — add just a trait
you want to remember, or just an image with no detail yet, and fill in the rest later. The
only requirement is that at least one field or the image isn't blank (a fully empty row is
rejected).

**Inline editing.** Click **Edit** on any row to edit its category, sub-category, detail, and
trait in place, and to replace or clear its image — the image cell becomes the same
drag-drop/upload/paste picker used when adding. **Save** commits the change immediately (into
localStorage and, if connected, the auto-backup file); **Cancel** discards it. The "Added" date
is shown as dd-mm-yyyy.

**Paste from clipboard.** Every image picker in the app — the main handwriting sample upload,
and every Formation image field (adding a new one or editing an existing one's image) — accepts
a pasted image in addition to drag-and-drop and click-to-browse. Click or Tab into the drop
area first (so it has focus), then Ctrl/Cmd+V.

**Where the data lives.** Entries (including the images, downscaled to keep storage light)
are saved to this browser's `localStorage`, not to any server — consistent with the rest of
the app's no-backend architecture, but unlike the analyzed handwriting sample, this library
is *intentionally* persisted across sessions/reloads so it can be built up over time. Clearing
your browser's site data for this app removes it, which is exactly why backup exists (see below).

**Backup &amp; restore.** Its own sub-tab (`src/state/useFormations.ts` backs both sub-tabs):

- **Export as JSON** / **Import from JSON** — always available, in every browser. Export
  downloads the whole library (images included, as data URLs) as one `.json` file; Import
  reads one back, either **merging** it into what's already here (default — any id collision
  is re-issued a new id so nothing existing is overwritten) or **replacing** the library
  outright (checkbox next to Import).
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
This is a nudge, not a data-loss warning — every change is already saved to localStorage
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
  intentionally persists in this browser's localStorage since it's a personal reference
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
