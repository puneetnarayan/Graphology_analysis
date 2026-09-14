"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { FormationsStore } from "./FormationsPanel";
import {
  generateFormationsBookPdf,
  filterFormationsForBook,
  type BookGroupBy,
  type BookEntryFilter,
} from "@/report/formationsBookPdf";

const GROUP_BY_OPTIONS: { value: BookGroupBy; label: string; hint: string }[] = [
  { value: "parameter", label: "By Parameter", hint: "One chapter per handwriting-analysis parameter (Slant, T-Bars, Margins, …)." },
  { value: "trait", label: "By Trait", hint: "One chapter per personality trait." },
  { value: "character", label: "By Character", hint: "One chapter per specific letter/character." },
];

const FILTER_OPTIONS: { value: BookEntryFilter; label: string; hint: string }[] = [
  { value: "complete", label: "Complete entries only", hint: "Has an image, a detail, and a trait — every printed page has real content." },
  { value: "imageOnly", label: "Has an image", hint: "Image required; detail/trait may be blank." },
  { value: "all", label: "All entries", hint: "Everything, including entries with nothing filled in yet." },
];

/**
 * Generates a KDP-ready 6x9in paperback interior PDF from the Formation
 * Library: title/copyright pages, a hyperlinked chaptered Table of Contents,
 * one chapter per group, and a back-of-book index by both Trait and
 * Character. All PDF construction happens client-side in `src/report/`.
 */
export function BookExportTab({ store }: { store: FormationsStore }) {
  const { formations } = store;
  const [title, setTitle] = useState("Letter Formations in Handwriting Analysis");
  const [author, setAuthor] = useState("");
  const [groupBy, setGroupBy] = useState<BookGroupBy>("parameter");
  const [filter, setFilter] = useState<BookEntryFilter>("complete");
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

  function handleGenerate() {
    setGenerating(true);
    setResult(null);
    try {
      const { includedCount: n } = generateFormationsBookPdf(formations, { title, author, groupBy, filter });
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
        pages, a hyperlinked Table of Contents, one chapter per group below, and a back-of-book index by both
        Trait and Character (each index page number is also a link). Margins are set generously for KDP&apos;s
        binding gutter at any realistic page count; double-check them against KDP&apos;s current spec for your
        final page count before uploading, and fill in the ISBN placeholder on the copyright page.
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
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-text-body mb-1.5">Chapter grouping</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGroupBy(opt.value)}
              className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                groupBy === opt.value
                  ? "border-primary bg-primary-softer/60"
                  : "border-border-soft bg-surface hover:border-primary/40"
              }`}
            >
              <p className="text-xs font-semibold text-text-strong">{opt.label}</p>
              <p className="text-[11px] text-text-muted mt-0.5">{opt.hint}</p>
            </button>
          ))}
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
          {generating ? "Generating…" : `Generate PDF (${includedCount} ${includedCount === 1 ? "entry" : "entries"})`}
        </Button>
        {includedCount === 0 && <p className="text-xs text-text-muted">No entries match this filter yet.</p>}
      </div>
      {result && <p className="mt-2 text-xs text-text-muted">{result}</p>}
    </Card>
  );
}
