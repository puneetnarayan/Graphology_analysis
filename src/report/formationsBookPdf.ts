import { BookPdfBuilder, BOOK_PAGE_W, BOOK_CONTENT_W } from "./bookPdfBuilder";
import { HANDWRITING_PARAMETERS, FORMATION_TAG_LABELS, type FormationEntry } from "@/types";

/** The fields a chapter can be built from. Multiple may be selected at once — a chapter then covers the combination. */
export type BookGroupBy = "parameter" | "trait" | "character";
export type BookEntryFilter = "complete" | "all" | "imageOnly";

/** Fixed priority order used both for compound chapter titles and for sorting. */
const DIM_ORDER: BookGroupBy[] = ["parameter", "character", "trait"];

/** "continuous" flows multiple entries down a page (like a reference list); "onePerPage" forces a fresh page per entry. */
export type BookLayout = "continuous" | "onePerPage";

export interface BookOptions {
  title: string;
  author: string;
  edition: string;
  year: string;
  isbn: string;
  /** At least one dimension, in any combination — a chapter is built per unique combination of the selected fields. */
  chapterDims: BookGroupBy[];
  filter: BookEntryFilter;
  layout: BookLayout;
  /**
   * 50-300: percent of the default image column size to print at. Above
   * 100 the image may be upscaled past its native resolution to reach that
   * size — the caller (a human looking at the preview) decides whether the
   * resulting softness is acceptable, rather than the builder silently
   * capping it.
   */
  imageSizePercent: number;
  /** Data URLs for optional front/back cover art, embedded full-bleed as the first/last page if present. */
  coverFrontDataUrl?: string | null;
  coverBackDataUrl?: string | null;
  /** Optional ISBN barcode image, overlaid bottom-right on the back cover if present, else shown on the copyright page. */
  barcodeDataUrl?: string | null;
}

const UNSPECIFIED_LABEL: Record<BookGroupBy, string> = {
  parameter: "(No parameter set)",
  trait: "(No trait set)",
  character: "(No character set)",
};

const DIM_CAPTION_LABEL: Record<"parameter" | "character" | "subCategory", string> = {
  parameter: "Parameter",
  character: "Character",
  subCategory: "Sub-category",
};

export function isCompleteFormation(f: FormationEntry): boolean {
  return !!f.imageDataUrl && f.detail.trim().length > 0 && f.trait.trim().length > 0;
}

export function filterFormationsForBook(formations: FormationEntry[], filter: BookEntryFilter): FormationEntry[] {
  switch (filter) {
    case "complete":
      return formations.filter(isCompleteFormation);
    case "imageOnly":
      return formations.filter((f) => !!f.imageDataUrl);
    case "all":
    default:
      return formations;
  }
}

function dimValue(f: FormationEntry, dim: BookGroupBy): string {
  if (dim === "parameter") return f.parameter.trim();
  if (dim === "character") return f.character?.trim() ?? "";
  return f.trait.trim();
}

interface ChapterKey {
  label: string;
  /** Raw (possibly blank) value per active chapter dimension, for sorting. */
  values: Partial<Record<BookGroupBy, string>>;
}

function buildChapterKey(f: FormationEntry, dims: BookGroupBy[]): ChapterKey {
  const active = DIM_ORDER.filter((d) => dims.includes(d));
  const values: Partial<Record<BookGroupBy, string>> = {};
  const parts: string[] = [];
  for (const dim of active) {
    const raw = dimValue(f, dim);
    values[dim] = raw;
    parts.push(raw || UNSPECIFIED_LABEL[dim]);
  }
  return { label: parts.join("  ·  ") || "All Formations", values };
}

function compareChapterKeys(a: ChapterKey, b: ChapterKey, dims: BookGroupBy[]): number {
  const active = DIM_ORDER.filter((d) => dims.includes(d));
  for (const dim of active) {
    const av = a.values[dim] ?? "";
    const bv = b.values[dim] ?? "";
    if (dim === "parameter") {
      const order = HANDWRITING_PARAMETERS as readonly string[];
      const ia = av ? order.indexOf(av) : -1;
      const ib = bv ? order.indexOf(bv) : -1;
      if (ia !== -1 || ib !== -1) {
        if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
        if (ia !== -1 && ib === -1) return -1;
        if (ia === -1 && ib !== -1) return 1;
      }
    }
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    const c = av.localeCompare(bv, undefined, { sensitivity: "base" });
    if (c !== 0) return c;
  }
  return 0;
}

/** Sub-heading fields: whichever of Parameter/Character/Sub-category aren't already the chapter's own dimension(s). */
function subheadingDims(chapterDims: BookGroupBy[]): ("parameter" | "character" | "subCategory")[] {
  const dims: ("parameter" | "character" | "subCategory")[] = [];
  if (!chapterDims.includes("parameter")) dims.push("parameter");
  if (!chapterDims.includes("character")) dims.push("character");
  dims.push("subCategory");
  return dims;
}

function subheadingValue(f: FormationEntry, dim: "parameter" | "character" | "subCategory"): string {
  if (dim === "parameter") return f.parameter.trim();
  if (dim === "character") return f.character?.trim() ?? "";
  return f.subCategory.trim();
}

function drawTitlePage(b: BookPdfBuilder, options: BookOptions): void {
  b.claimPage();
  const doc = b.doc;
  const cx = BOOK_PAGE_W / 2;
  doc.setFont("times", "bold");
  doc.setFontSize(25);
  doc.setTextColor(30, 27, 24);
  const titleLines = doc.splitTextToSize(options.title || "Letter Formations", BOOK_CONTENT_W) as string[];
  let ty = 78;
  for (const line of titleLines) {
    const w = doc.getTextWidth(line);
    doc.text(line, cx - w / 2, ty);
    ty += 10;
  }
  ty += 5;
  doc.setDrawColor(138, 52, 85);
  doc.setLineWidth(0.8);
  doc.line(cx - 14, ty, cx + 14, ty);
  ty += 13;
  if (options.author.trim()) {
    doc.setFont("times", "italic");
    doc.setFontSize(13);
    doc.setTextColor(128, 120, 112);
    const w = doc.getTextWidth(options.author.trim());
    doc.text(options.author.trim(), cx - w / 2, ty);
    ty += 9;
  }
  if (options.edition.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(128, 120, 112);
    const label = options.edition.trim();
    const w = doc.getTextWidth(label);
    doc.text(label, cx - w / 2, ty);
  }
  b.markChromeFree();
}

function drawCopyrightPage(b: BookPdfBuilder, options: BookOptions): void {
  b.addPage();
  b.y = 148;
  const year = options.year.trim() || String(new Date().getFullYear());
  const author = options.author.trim();
  b.paragraph(options.title || "Letter Formations", { size: 10, bold: true, font: "helvetica" });
  if (author) b.paragraph(`By ${author}`, { size: 9, color: [128, 120, 112] });
  if (options.edition.trim()) b.paragraph(options.edition.trim(), { size: 8.5, color: [128, 120, 112], italic: true });
  b.spacer(4);
  b.paragraph(`Copyright © ${year}${author ? ` ${author}` : ""}. All rights reserved.`, { size: 8.5 });
  b.paragraph(
    "No part of this book may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without prior written permission from the copyright holder, except for brief quotations used in reviews.",
    { size: 8 },
  );
  b.spacer(3);
  b.paragraph(options.isbn.trim() ? `ISBN: ${options.isbn.trim()}` : "ISBN: [Add your ISBN here before publishing]", {
    size: 8,
    italic: !options.isbn.trim(),
    color: [128, 120, 112],
  });
  b.spacer(3);
  b.paragraph(
    "Compiled from the Graphology Analyzer app's Letter Formations library. The formations, details, and trait interpretations recorded here are the author's own handwriting-analysis notes and are presented for informational and educational purposes.",
    { size: 7.5, color: [128, 120, 112] },
  );
  // The barcode normally lives on the back cover (see addCoverPage's overlay); only shown here
  // as a fallback so it isn't lost entirely when no back cover image was provided.
  if (options.barcodeDataUrl && !options.coverBackDataUrl) {
    b.spacer(4);
    b.paragraph("ISBN barcode:", { size: 7.5, color: [128, 120, 112] });
    b.image(options.barcodeDataUrl, 40, 25);
  }
  b.markChromeFree();
}

const MUTED_COLOR: [number, number, number] = [128, 120, 112];
/** Uniform body size for both Detail and Trait — same scale, different voice (regular vs. italic), not different sizes. */
const ENTRY_BODY_SIZE = 10.5;

/**
 * Column widths are fixed regardless of the Image size setting — only how
 * large an image is allowed to print *within* its own column changes with
 * that setting. This keeps Detail and Trait anchored in the same place
 * (Detail always the visual center column) no matter what Image size is
 * chosen, instead of the whole layout shifting as the image column grows.
 */
const IMG_COL_FRAC = 0.3;
const DETAIL_COL_FRAC_OF_REST = 0.6;

/**
 * One formation, three columns: image (left) · Detail (center, the primary
 * readable text) · Trait (right, a short italic tagline — no "Trait:"
 * label, just the trait itself). All three are measured first, then
 * vertically centered against whichever is tallest, so a short entry next
 * to a comparatively tall image doesn't look top-anchored and lopsided.
 * `imageScale` (1 = default size, native resolution only; >1 prints
 * larger, upscaling past native resolution if the source is small) comes
 * straight from the user's Image size control — it only grows the image
 * within its fixed column, never the column itself, so Detail/Trait never
 * shift position as it changes.
 */
function drawEntry(b: BookPdfBuilder, f: FormationEntry, imageScale: number): void {
  const gap = 5;
  const lineGap = ENTRY_BODY_SIZE * 0.52;

  const imgColW = BOOK_CONTENT_W * IMG_COL_FRAC;
  const remW = BOOK_CONTENT_W - imgColW - gap * 2;
  const detailColW = remW * DETAIL_COL_FRAC_OF_REST;
  const traitColW = remW - detailColW;
  const maxImgH = Math.min(220, 70 * imageScale);

  const imgBox = f.imageDataUrl ? b.measureImageBox(f.imageDataUrl, imgColW, maxImgH, imageScale) : { w: 0, h: 0 };

  const hasDetail = !!f.detail.trim();
  const hasTrait = !!f.trait.trim();
  const detailLines = hasDetail
    ? b.measureParagraphLines(f.detail.trim(), detailColW, ENTRY_BODY_SIZE, "times")
    : hasTrait
      ? []
      : b.measureParagraphLines("(No detail recorded for this entry.)", detailColW, ENTRY_BODY_SIZE, "times");
  const traitLines = hasTrait ? b.measureParagraphLines(f.trait.trim(), traitColW, ENTRY_BODY_SIZE, "times") : [];
  const tagLines = f.tag ? b.measureParagraphLines(FORMATION_TAG_LABELS[f.tag], traitColW, 7.5, "helvetica", true) : [];
  const tagBlockH = tagLines.length ? tagLines.length * 3.9 + 2 : 0;

  const detailH = detailLines.length * lineGap;
  const traitH = tagBlockH + traitLines.length * lineGap;
  const totalH = Math.max(imgBox.h, detailH, traitH, 6);

  b.ensureSpace(totalH + 4);
  const topY = b.y;
  const x = b.contentLeft();

  if (f.imageDataUrl && imgBox.w > 0) {
    b.drawImageBox(f.imageDataUrl, x, topY + (totalH - imgBox.h) / 2, imgBox.w, imgBox.h);
  }

  const detailX = x + imgColW + gap;
  if (detailLines.length) {
    b.drawParagraphLines(detailLines, detailX, topY + (totalH - detailH) / 2, {
      size: ENTRY_BODY_SIZE,
      italic: !hasDetail && !hasTrait,
      color: !hasDetail && !hasTrait ? MUTED_COLOR : undefined,
    });
  }

  const traitX = detailX + detailColW + gap;
  let ty = topY + (totalH - traitH) / 2;
  if (tagLines.length) {
    ty = b.drawParagraphLines(tagLines, traitX, ty, { size: 7.5, bold: true, color: MUTED_COLOR });
    ty += 2;
  }
  if (traitLines.length) {
    b.drawParagraphLines(traitLines, traitX, ty, { size: ENTRY_BODY_SIZE, italic: true });
  }

  b.y = topY + totalH + 4;
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "formations-book";
}

const INDEX_TRAIT_TITLE = "Index by Trait";
const INDEX_CHARACTER_TITLE = "Index by Character";

function drawIndexChapter(b: BookPdfBuilder, id: string, title: string, intro: string, source: Map<string, number[]>): void {
  b.startChapter(id, title);
  b.paragraph(intro, { size: 8.5, italic: true, color: [128, 120, 112] });
  b.spacer(2);
  for (const term of Array.from(source.keys()).sort((a, c) => a.localeCompare(c, undefined, { sensitivity: "base" }))) {
    b.indexRow(term, source.get(term)!);
  }
}

interface RenderResult {
  doc: import("jspdf").jsPDF;
  totalPages: number;
  /** The page the Index by Trait chapter started on — used to work out how many pages the two index chapters together consumed. */
  indexTraitStartPage: number;
  traitPages: Map<string, number[]>;
  charPages: Map<string, number[]>;
}

/**
 * Renders the whole book once. `indexPageMaps`, when given, means "draw the
 * two index chapters right after the TOC, using these already-known page
 * numbers" (a real, final render); when omitted, the index chapters are
 * drawn at the end instead, using page numbers discovered live while
 * rendering content chapters (used as pass 1, purely to learn where each
 * trait/character would land, and how many pages the index chapters
 * themselves need).
 */
function renderPass(
  chapterLabels: string[],
  groups: Map<string, { key: ChapterKey; entries: FormationEntry[] }>,
  subDims: ("parameter" | "character" | "subCategory")[],
  options: BookOptions,
  title: string,
  indexPageMaps?: { traitPages: Map<string, number[]>; charPages: Map<string, number[]> },
): RenderResult {
  const b = new BookPdfBuilder(title);

  if (options.coverFrontDataUrl) b.addCoverPage(options.coverFrontDataUrl);
  drawTitlePage(b, { ...options, title });
  drawCopyrightPage(b, { ...options, title });

  const indexFirst = !!indexPageMaps;
  const chapterTitles = indexFirst
    ? [INDEX_TRAIT_TITLE, INDEX_CHARACTER_TITLE, ...chapterLabels]
    : [...chapterLabels, INDEX_TRAIT_TITLE, INDEX_CHARACTER_TITLE];
  b.reserveToc(chapterTitles);

  const traitIntro = "Every distinct trait referenced in this book, with the page(s) where a formation illustrating it appears.";
  const charIntro = "Every distinct character referenced in this book, with the page(s) where a formation illustrating it appears.";

  let indexTraitStartPage = 0;
  if (indexFirst) {
    indexTraitStartPage = b.pageNumber + 1;
    drawIndexChapter(b, "index-trait", INDEX_TRAIT_TITLE, traitIntro, indexPageMaps.traitPages);
    drawIndexChapter(b, "index-character", INDEX_CHARACTER_TITLE, charIntro, indexPageMaps.charPages);
  }

  const traitPages = new Map<string, number[]>();
  const charPages = new Map<string, number[]>();
  const imageScale = Math.min(3, Math.max(0.5, options.imageSizePercent / 100));

  for (const label of chapterLabels) {
    b.startChapter(label, label);
    let prevSubKey = "";
    let first = true;
    for (const f of groups.get(label)!.entries) {
      if (options.layout === "onePerPage") {
        if (!first) b.addPage();
      } else if (!first) {
        b.divider();
      }
      first = false;

      const subKey = subDims.map((d) => subheadingValue(f, d)).join("");
      if (subKey !== prevSubKey) {
        const subLabel = subDims
          .map((d) => ({ d, v: subheadingValue(f, d) }))
          .filter((p) => p.v)
          .map((p) => `${DIM_CAPTION_LABEL[p.d]}: ${p.d === "character" ? `"${p.v}"` : p.v}`)
          .join("   ·   ");
        if (subLabel) b.subheading(subLabel);
        prevSubKey = subKey;
      }

      drawEntry(b, f, imageScale);
      const page = b.pageNumber;
      const traitKey = f.trait.trim();
      if (traitKey) traitPages.set(traitKey, [...(traitPages.get(traitKey) ?? []), page]);
      const charKey = f.character?.trim();
      if (charKey) charPages.set(charKey, [...(charPages.get(charKey) ?? []), page]);
    }
  }

  if (!indexFirst) {
    indexTraitStartPage = b.pageNumber + 1;
    drawIndexChapter(b, "index-trait", INDEX_TRAIT_TITLE, traitIntro, traitPages);
    drawIndexChapter(b, "index-character", INDEX_CHARACTER_TITLE, charIntro, charPages);
  }

  if (options.coverBackDataUrl) b.addCoverPage(options.coverBackDataUrl, options.barcodeDataUrl);

  b.finalize();
  return { doc: b.doc, totalPages: b.pageNumber, indexTraitStartPage, traitPages, charPages };
}

/**
 * Builds (but does not save) a KDP-ready 6x9in interior PDF from the
 * Formation Library — returns the live jsPDF document so the caller can
 * preview it (e.g. `doc.output("blob")`) before deciding to download it.
 * Chapters are the unique combination of the selected chapterDims
 * (Parameter/Trait/Character, any combination); within a chapter, entries
 * are grouped for display by whichever of Parameter/Character/Sub-category
 * aren't already the chapter's own dimension, printing a sub-heading only
 * when that combination changes so runs of similar formations aren't
 * captioned redundantly. Entries either flow continuously down each page
 * or get one page each, per `options.layout`. A back-of-book alphabetical
 * index by both Trait and Character comes right after the Table of
 * Contents, every index page number individually hyperlinked (the whole
 * row, not just the digits), as is the whole Table of Contents row for
 * each chapter.
 *
 * Getting the index to appear before the content chapters it points into
 * (rather than after them, where its page numbers would already be known)
 * takes two render passes: pass 1 renders the book with the index at the
 * end — as it would naturally fall out of a single top-to-bottom pass —
 * purely to discover which page each trait/character lands on. The number
 * of pages the two index chapters themselves take is knowable exactly from
 * that same pass (their own start page vs. the final page count) and is
 * independent of where they're placed, so every content-chapter page
 * number from pass 1 shifts by that same fixed amount in the real, second
 * pass — which is what actually gets returned.
 */
export function buildFormationsBookPdf(
  formations: FormationEntry[],
  options: BookOptions,
): { doc: import("jspdf").jsPDF; includedCount: number; filename: string } {
  const chapterDims = options.chapterDims.length ? options.chapterDims : (["parameter"] as BookGroupBy[]);
  const included = filterFormationsForBook(formations, options.filter);

  const groups = new Map<string, { key: ChapterKey; entries: FormationEntry[] }>();
  for (const f of included) {
    const key = buildChapterKey(f, chapterDims);
    const existing = groups.get(key.label);
    if (existing) existing.entries.push(f);
    else groups.set(key.label, { key, entries: [f] });
  }

  const subDims = subheadingDims(chapterDims);
  const chapterLabels = Array.from(groups.keys()).sort((a, c) => compareChapterKeys(groups.get(a)!.key, groups.get(c)!.key, chapterDims));
  for (const label of chapterLabels) {
    groups.get(label)!.entries.sort((a, b2) => {
      for (const dim of subDims) {
        const av = subheadingValue(a, dim);
        const bv = subheadingValue(b2, dim);
        if (!av && bv) return 1;
        if (av && !bv) return -1;
        const c = av.localeCompare(bv, undefined, { sensitivity: "base" });
        if (c !== 0) return c;
      }
      return a.createdAt.localeCompare(b2.createdAt);
    });
  }

  const title = options.title.trim() || "Letter Formations in Handwriting Analysis";

  const pass1 = renderPass(chapterLabels, groups, subDims, options, title);
  const shift = pass1.totalPages - pass1.indexTraitStartPage + 1;
  const shiftPages = (m: Map<string, number[]>) => new Map(Array.from(m, ([term, pages]) => [term, pages.map((p) => p + shift)] as const));

  const pass2 = renderPass(chapterLabels, groups, subDims, options, title, {
    traitPages: shiftPages(pass1.traitPages),
    charPages: shiftPages(pass1.charPages),
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${slugify(title)}-${dateStr}.pdf`;

  return { doc: pass2.doc, includedCount: included.length, filename };
}
