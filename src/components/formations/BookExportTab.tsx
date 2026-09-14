"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { jsPDF } from "jspdf";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import type { FormationsStore } from "./FormationsPanel";
import {
  buildFormationsBookPdf,
  filterFormationsForBook,
  type BookGroupBy,
  type BookEntryFilter,
  type BookLayout,
} from "@/report/formationsBookPdf";

const GROUP_BY_OPTIONS: { value: BookGroupBy; label: string; hint: string }[] = [
  { value: "parameter", label: "Parameter", hint: "Slant, T-Bars, Margins, …" },
  { value: "trait", label: "Trait", hint: "Personality trait" },
  { value: "character", label: "Character", hint: "Specific letter" },
];

const FILTER_OPTIONS: { value: BookEntryFilter; label: string; hint: string }[] = [
  { value: "complete", label: "Complete entries only", hint: "Has an image, a detail, and a trait — every printed page has real content." },
  { value: "imageOnly", label: "Has an image", hint: "Image required; detail/trait may be blank." },
  { value: "all", label: "All entries", hint: "Everything, including entries with nothing filled in yet." },
];

const LAYOUT_OPTIONS: { value: BookLayout; label: string; hint: string }[] = [
  { value: "continuous", label: "Continuous", hint: "Entries flow down the page, several per page where they fit — a compact reference layout." },
  { value: "onePerPage", label: "One per page", hint: "Every formation starts a fresh page — more white space, easier to read at a glance." },
];

/** Cover/barcode art deserves more resolution than the formation thumbnails; downscale only if truly huge. */
const MAX_COVER_DIM = 2400;

async function fileToCoverDataUrl(file: File): Promise<string> {
  const img = await loadImageElement(file);
  const canvas = toAnalysisCanvas(imageElementToCanvas(img), MAX_COVER_DIM);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function ImagePicker({
  label,
  dataUrl,
  onChange,
}: {
  label: string;
  dataUrl: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      onChange(await fileToCoverDataUrl(file));
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <p className="text-xs font-medium text-text-body mb-1.5">{label} (optional)</p>
      {dataUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview, no optimization needed */}
          <img src={dataUrl} alt={`${label} preview`} className="h-24 w-auto rounded-lg border border-border-soft object-contain bg-surface-alt" />
          <Button variant="outline" className="text-xs px-2.5 py-1" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed px-3 py-5 text-center cursor-pointer transition-colors ${
            dragOver ? "border-primary bg-primary-softer/50" : "border-border-soft bg-surface hover:border-primary/40"
          }`}
        >
          <p className="text-xs text-text-muted">{busy ? "Loading…" : "Click to browse or drag & drop an image"}</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface Preview {
  doc: jsPDF;
  url: string;
  filename: string;
  includedCount: number;
}

function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="dialog" aria-modal="true">
      <Card className="max-w-4xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Preview</CardTitle>
            <CardSubtitle>
              {preview.includedCount} {preview.includedCount === 1 ? "entry" : "entries"} — scroll through before
              downloading. Judge for yourself whether any upscaled images look acceptably sharp; if not, close this,
              lower Image size, and regenerate.
            </CardSubtitle>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => preview.doc.save(preview.filename)}>Download PDF</Button>
          </div>
        </div>
        <div className="mt-3 flex-1 min-h-[60vh] rounded-xl border border-border-soft overflow-hidden bg-surface-alt">
          <iframe src={preview.url} title="Book PDF preview" className="w-full h-full min-h-[60vh]" />
        </div>
      </Card>
    </div>
  );
}

/**
 * Generates a KDP-ready 6x9in paperback interior PDF from the Formation
 * Library: title/copyright pages (with optional front/back cover art and an
 * ISBN barcode), a hyperlinked chaptered Table of Contents, one chapter per
 * selected grouping combination, and a back-of-book index by both Trait and
 * Character. All PDF construction happens client-side in `src/report/`; a
 * preview modal opens before any download so pixelation, layout, and cover
 * placement can be judged first-hand.
 */
export function BookExportTab({ store }: { store: FormationsStore }) {
  const { formations } = store;
  const [title, setTitle] = useState("Letter Formations in Handwriting Analysis");
  const [author, setAuthor] = useState("");
  const [edition, setEdition] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [isbn, setIsbn] = useState("");
  const [chapterDims, setChapterDims] = useState<BookGroupBy[]>(["parameter"]);
  const [filter, setFilter] = useState<BookEntryFilter>("complete");
  const [layout, setLayout] = useState<BookLayout>("continuous");
  const [imageSizePercent, setImageSizePercent] = useState(100);
  const [coverFront, setCoverFront] = useState<string | null>(null);
  const [coverBack, setCoverBack] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
    // Only revoke on unmount / when preview itself changes below — see closePreview / handleGenerate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({
      complete: filterFormationsForBook(formations, "complete").length,
      imageOnly: filterFormationsForBook(formations, "imageOnly").length,
      all: filterFormationsForBook(formations, "all").length,
    }),
    [formations],
  );
  const includedCount = counts[filter];

  function toggleDim(dim: BookGroupBy) {
    setChapterDims((prev) => {
      if (prev.includes(dim)) {
        const next = prev.filter((d) => d !== dim);
        return next.length ? next : prev; // keep at least one selected
      }
      return [...prev, dim];
    });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { doc, includedCount: n, filename } = buildFormationsBookPdf(formations, {
        title,
        author,
        edition,
        year,
        isbn,
        chapterDims,
        filter,
        layout,
        imageSizePercent,
        coverFrontDataUrl: coverFront,
        coverBackDataUrl: coverBack,
        barcodeDataUrl: barcode,
      });
      const url = URL.createObjectURL(doc.output("blob"));
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ doc, url, filename, includedCount: n });
    } catch (err) {
      setError(err instanceof Error ? `Could not generate the PDF: ${err.message}` : "Could not generate the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardTitle>Book / PDF</CardTitle>
      <CardSubtitle>
        Turn the Formation Library into a print-ready 6&times;9in paperback interior PDF — title and copyright
        pages, a hyperlinked Table of Contents (every row fully clickable), one chapter per grouping combination
        below, and a back-of-book index by both Trait and Character. Margins are set generously for KDP&apos;s
        binding gutter at any realistic page count; double-check them against KDP&apos;s current spec for your
        final page count before uploading. A preview opens before any download so you can judge the result
        yourself.
      </CardSubtitle>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-xs font-medium text-text-body">
          Book title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="text-xs font-medium text-text-body">
          Author (optional)
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Leave blank to omit"
            className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="text-xs font-medium text-text-body">
          Edition (optional)
          <input
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
            placeholder="e.g. First Edition"
            className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="text-xs font-medium text-text-body">
          Copyright year
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder={String(new Date().getFullYear())}
            className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="text-xs font-medium text-text-body sm:col-span-2">
          ISBN (optional)
          <input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="e.g. 978-1-234567-89-0 — leave blank for a placeholder"
            className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ImagePicker label="Front cover" dataUrl={coverFront} onChange={setCoverFront} />
        <ImagePicker label="Back cover" dataUrl={coverBack} onChange={setCoverBack} />
        <ImagePicker label="ISBN barcode" dataUrl={barcode} onChange={setBarcode} />
      </div>
      <p className="mt-1.5 text-[11px] text-text-muted">
        Front/back cover art, if provided, is embedded as its own full page (front first, back last), fitted to
        the 6&times;9in page without cropping. The barcode, if provided, is overlaid in the bottom-right corner of
        the back cover (the conventional spot) — or shown on the copyright page if there&apos;s no back cover.
        Sizing and print-readiness of anything you upload here is your own responsibility — this just embeds it.
      </p>

      <div className="mt-5">
        <p className="text-xs font-medium text-text-body mb-1.5">
          Chapter grouping <span className="font-normal text-text-muted">(pick one or more — click to select/deselect)</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {GROUP_BY_OPTIONS.map((opt) => {
            const active = chapterDims.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDim(opt.value)}
                className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                  active ? "border-primary bg-primary-softer/60" : "border-border-soft bg-surface hover:border-primary/40"
                }`}
              >
                <p className="text-xs font-semibold text-text-strong flex items-center gap-1.5">
                  <span
                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] leading-none ${
                      active ? "bg-primary border-primary text-white" : "border-border-soft"
                    }`}
                  >
                    {active ? "✓" : ""}
                  </span>
                  By {opt.label}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5 ml-5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-text-muted">
          Selecting more than one combines them into one chapter per unique combination (e.g. Parameter + Character
          gives a chapter per parameter/character pair). Whichever of Parameter, Character, or Sub-category you
          don&apos;t select still gets grouped within each chapter — a sub-heading appears only when it changes,
          so a run of similar formations isn&apos;t re-captioned on every page.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-text-body mb-1.5">Page layout</p>
          <div className="grid grid-cols-2 gap-2">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLayout(opt.value)}
                className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                  layout === opt.value ? "border-primary bg-primary-softer/60" : "border-border-soft bg-surface hover:border-primary/40"
                }`}
              >
                <p className="text-xs font-semibold text-text-strong">{opt.label}</p>
                <p className="text-[11px] text-text-muted mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-text-body">
            Image size <span className="font-normal text-text-muted">({imageSizePercent}%)</span>
            <input
              type="range"
              min={50}
              max={250}
              step={10}
              value={imageSizePercent}
              onChange={(e) => setImageSizePercent(Number(e.target.value))}
              className="mt-2 w-full accent-primary"
            />
          </label>
          <p className="text-[11px] text-text-muted mt-1">
            100% prints each image at up to its native resolution only (sharpest). Above 100%, small images may be
            upscaled and look softer or pixelated — use the preview to judge whether that&apos;s acceptable.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-text-body mb-1.5">Which entries to include</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                filter === opt.value
                  ? "border-primary bg-primary-softer/60"
                  : "border-border-soft bg-surface hover:border-primary/40"
              }`}
            >
              <p className="text-xs font-semibold text-text-strong">
                {opt.label} <span className="font-normal text-text-muted">({counts[opt.value]})</span>
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">{opt.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <Button onClick={handleGenerate} disabled={generating || includedCount === 0}>
          {generating ? "Generating…" : `Preview PDF (${includedCount} ${includedCount === 1 ? "entry" : "entries"})`}
        </Button>
        {includedCount === 0 && <p className="text-xs text-text-muted">No entries match this filter yet.</p>}
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {preview && <PreviewModal preview={preview} onClose={closePreview} />}
    </Card>
  );
}
