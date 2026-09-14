"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import type { FormationsStore } from "./FormationsPanel";
import {
  generateFormationsBookPdf,
  filterFormationsForBook,
  type BookGroupBy,
  type BookEntryFilter,
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

/** Cover art deserves more resolution than the formation thumbnails; downscale only if truly huge. */
const MAX_COVER_DIM = 2400;

async function fileToCoverDataUrl(file: File): Promise<string> {
  const img = await loadImageElement(file);
  const canvas = toAnalysisCanvas(imageElementToCanvas(img), MAX_COVER_DIM);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function CoverPicker({
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

/**
 * Generates a KDP-ready 6x9in paperback interior PDF from the Formation
 * Library: title/copyright pages (with optional front/back cover art), a
 * hyperlinked chaptered Table of Contents, one chapter per selected
 * grouping combination, and a back-of-book index by both Trait and
 * Character. All PDF construction happens client-side in `src/report/`.
 */
export function BookExportTab({ store }: { store: FormationsStore }) {
  const { formations } = store;
  const [title, setTitle] = useState("Letter Formations in Handwriting Analysis");
  const [author, setAuthor] = useState("");
  const [edition, setEdition] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [chapterDims, setChapterDims] = useState<BookGroupBy[]>(["parameter"]);
  const [filter, setFilter] = useState<BookEntryFilter>("complete");
  const [coverFront, setCoverFront] = useState<string | null>(null);
  const [coverBack, setCoverBack] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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

  function handleGenerate() {
    setGenerating(true);
    setResult(null);
    try {
      const { includedCount: n } = generateFormationsBookPdf(formations, {
        title,
        author,
        edition,
        year,
        chapterDims,
        filter,
        coverFrontDataUrl: coverFront,
        coverBackDataUrl: coverBack,
      });
      setResult(`Generated a ${n}-entry PDF. Check your downloads.`);
    } catch (err) {
      setResult(err instanceof Error ? `Could not generate the PDF: ${err.message}` : "Could not generate the PDF.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardTitle>Book / PDF</CardTitle>
      <CardSubtitle>
        Turn the Formation Library into a print-ready 6&times;9in paperback interior PDF — title and copyright
        pages, a hyperlinked Table of Contents, one chapter per grouping combination below (one formation per
        page, image beside its trait and detail), and a back-of-book index by both Trait and Character. Margins
        are set generously for KDP&apos;s binding gutter at any realistic page count; double-check them against
        KDP&apos;s current spec for your final page count before uploading, and fill in the ISBN placeholder on
        the copyright page. Images print at up to their native resolution only, never upscaled, so they stay
        sharp instead of pixelating.
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
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CoverPicker label="Front cover" dataUrl={coverFront} onChange={setCoverFront} />
        <CoverPicker label="Back cover" dataUrl={coverBack} onChange={setCoverBack} />
      </div>
      <p className="mt-1.5 text-[11px] text-text-muted">
        If provided, each is embedded as its own full page (front first, back last), fitted to the 6&times;9in
        page without cropping. Sizing and print-readiness of your cover art is your own responsibility — this
        just embeds what you upload.
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
          {generating ? "Generating…" : `Generate PDF (${includedCount} ${includedCount === 1 ? "entry" : "entries"})`}
        </Button>
        {includedCount === 0 && <p className="text-xs text-text-muted">No entries match this filter yet.</p>}
      </div>
      {result && <p className="mt-2 text-xs text-text-muted">{result}</p>}
    </Card>
  );
}
