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
| T-bars, I-dots, Ovals | Experimental | Heuristic satellite-component detection; requires a minimum sample count before any interpretation is offered |
| Rhythm & Speed | Experimental | Proxy from stroke continuity + size/spacing variability |
| Signature | Experimental | Conservative last-line heuristic; manual region confirmation is the reliable path |
| Connections, Capital Letters, Punctuation | **Not yet implemented** | The Analysis tabs for these exist and say so honestly rather than showing fabricated results |

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

## Testing

`npm test` runs Vitest unit tests covering:

- statistics helpers (mean/median/stddev)
- sample-sufficiency scaling
- rule activation (fires with sufficient confident evidence, does not fire with too
  few samples or too-low confidence, degrades under poor scan quality)
- contradiction detection between opposing same-trait rules

## Known limitations

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
