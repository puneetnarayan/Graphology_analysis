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
  rules/          Graphology rule engine: schema, per-category rule sets, aggregation
  config/         Centralized thresholds — no magic numbers scattered in logic
  utils/          Canvas/image/segmentation/geometry/stats primitives
  workers/        Web Worker entry point that runs the analysis pipeline off the main thread
  report/         Text/PDF export builders
  types/          Shared TypeScript types
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
an "a", "o", "e", "d" or "g" specifically. That requires OCR (see Known limitations).

## Privacy / no-storage architecture

- Handwriting images are loaded as in-memory `File`/`Canvas`/`ImageData` objects and
  never leave the browser.
- There is no backend API route, database, or file storage in this application.
- The only network requests the app makes are for its own static assets and Google
  Fonts; no handwriting pixel data is ever part of a network request.
- The JSON report export deliberately excludes raw image bytes — only normalized
  region coordinates (0–1 fractions) and measurements are included.
- Closing or refreshing the tab releases all in-memory image data; nothing persists
  across sessions (no localStorage/IndexedDB image caching).

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

## Live re-analysis

Scan quality assessment, feature extraction and rule evaluation run together as one
continuous pass in the Web Worker (`runFullAnalysis` in `src/state/workflowStore.tsx`) —
there's no separate staged wait between steps once it starts.

After your first **Accept & Analyze**, any further change on the **Image Preparation**
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

- No OCR / per-letter identification. The shape classifier above buckets components by
  geometry (loop, zone, aspect ratio), not by which specific letter (a vs o vs e) produced
  them. Real per-letter analysis would need a lightweight OCR pass (e.g. Tesseract.js) —
  planned as a future iteration, not implemented here.
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
