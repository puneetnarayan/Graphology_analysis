import { BookPdfBuilder, BOOK_PAGE_W, BOOK_CONTENT_W } from "./bookPdfBuilder";
import { HANDWRITING_PARAMETERS, FORMATION_TAG_LABELS, type FormationEntry } from "@/types";

export type BookGroupBy = "parameter" | "trait" | "character";
export type BookEntryFilter = "complete" | "all" | "imageOnly";

export interface BookOptions {
  title: string;
  author: string;
  groupBy: BookGroupBy;
  filter: BookEntryFilter;
}

const UNSPECIFIED_LABEL: Record<BookGroupBy, string> = {
  parameter: "(No parameter set)",
  trait: "(No trait set)",
  character: "(No character set)",
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

function groupKey(f: FormationEntry, groupBy: BookGroupBy): string {
  if (groupBy === "parameter") return f.parameter.trim() || UNSPECIFIED_LABEL.parameter;
  if (groupBy === "trait") return f.trait.trim() || UNSPECIFIED_LABEL.trait;
  return f.character?.trim() || UNSPECIFIED_LABEL.character;
}

function sortChapterKeys(keys: string[], groupBy: BookGroupBy): string[] {
  const unspecified = UNSPECIFIED_LABEL[groupBy];
  if (groupBy === "parameter") {
    const order = HANDWRITING_PARAMETERS as readonly string[];
    return [...keys].sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      if (a === unspecified) return 1;
      if (b === unspecified) return -1;
      return a.localeCompare(b);
    });
  }
  return [...keys].sort((a, b) => {
    if (a === unspecified) return 1;
    if (b === unspecified) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

function drawTitlePage(b: BookPdfBuilder, options: BookOptions): void {
  const doc = b.doc;
  const cx = BOOK_PAGE_W / 2;
  doc.setFont("times", "bold");
  doc.setFontSize(25);
  doc.setTextColor(30, 27, 24);
  const titleLines = doc.splitTextToSize(options.title || "Letter Formations", BOOK_CONTENT_W) as string[];
  let ty = 82;
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
  }
}

function drawCopyrightPage(b: BookPdfBuilder, options: BookOptions): void {
  b.addPage();
  b.y = 148;
  const year = new Date().getFullYear();
  const author = options.author.trim();
  b.paragraph(options.title || "Letter Formations", { size: 10, bold: true, font: "helvetica" });
  if (author) b.paragraph(`By ${author}`, { size: 9, color: [128, 120, 112] });
  b.spacer(4);
  b.paragraph(`Copyright © ${year}${author ? ` ${author}` : ""}. All rights reserved.`, { size: 8.5 });
  b.paragraph(
    "No part of this book may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without prior written permission from the copyright holder, except for brief quotations used in reviews.",
    { size: 8 },
  );
  b.spacer(3);
  b.paragraph("ISBN: [Add your ISBN here before publishing]", { size: 8, italic: true, color: [128, 120, 112] });
  b.spacer(3);
  b.paragraph(
    "Compiled from the Graphology Analyzer app's Letter Formations library. The formations, details, and trait interpretations recorded here are the author's own handwriting-analysis notes and are presented for informational and educational purposes.",
    { size: 7.5, color: [128, 120, 112] },
  );
}

function drawEntry(b: BookPdfBuilder, f: FormationEntry): void {
  b.ensureSpace(14);
  const captionParts: string[] = [];
  if (f.parameter.trim()) captionParts.push(`Parameter: ${f.parameter.trim()}`);
  if (f.character?.trim()) captionParts.push(`Character: "${f.character.trim()}"`);
  if (f.subCategory.trim()) captionParts.push(`Sub-category: ${f.subCategory.trim()}`);
  if (f.tag) captionParts.push(`Tag: ${FORMATION_TAG_LABELS[f.tag]}`);
  if (captionParts.length) {
    b.paragraph(captionParts.join("   ·   "), { size: 8, bold: true, color: [128, 120, 112], font: "helvetica" });
  }

  if (f.imageDataUrl) {
    b.image(f.imageDataUrl, BOOK_CONTENT_W * 0.55, 55);
  }

  if (f.trait.trim()) {
    b.paragraph(`Trait: ${f.trait.trim()}`, { size: 10.5, bold: true });
  }
  if (f.detail.trim()) {
    b.paragraph(f.detail.trim(), { size: 9.5 });
  }
  if (!f.imageDataUrl && !f.trait.trim() && !f.detail.trim() && captionParts.length === 0) {
    b.paragraph("(No details recorded for this entry.)", { size: 8.5, italic: true, color: [128, 120, 112] });
  }
  b.divider();
  b.spacer(2);
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "formations-book";
}

/**
 * Builds and downloads a KDP-ready 6x9in interior PDF from the Formation
 * Library: a title page, copyright page, chaptered Table of Contents, one
 * chapter per group (Parameter/Trait/Character, per `options.groupBy`), and
 * a back-of-book alphabetical index by both Trait and Character — every TOC
 * and index row hyperlinked to its target page.
 */
export function generateFormationsBookPdf(formations: FormationEntry[], options: BookOptions): { includedCount: number } {
  const included = filterFormationsForBook(formations, options.filter);

  const groups = new Map<string, FormationEntry[]>();
  for (const f of included) {
    const key = groupKey(f, options.groupBy);
    const list = groups.get(key);
    if (list) list.push(f);
    else groups.set(key, [f]);
  }
  const chapterKeys = sortChapterKeys(Array.from(groups.keys()), options.groupBy);
  for (const key of chapterKeys) {
    groups.get(key)!.sort((a, b) => {
      const byChar = (a.character || "").localeCompare(b.character || "");
      if (byChar !== 0) return byChar;
      const bySub = (a.subCategory || "").localeCompare(b.subCategory || "");
      if (bySub !== 0) return bySub;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  const title = options.title.trim() || "Letter Formations in Handwriting Analysis";
  const b = new BookPdfBuilder(title);

  drawTitlePage(b, { ...options, title });
  drawCopyrightPage(b, { ...options, title });

  const chapterTitles = [...chapterKeys, "Index by Trait", "Index by Character"];
  b.reserveToc(chapterTitles);

  const traitPages = new Map<string, number[]>();
  const charPages = new Map<string, number[]>();

  for (const key of chapterKeys) {
    b.startChapter(key, key);
    for (const f of groups.get(key)!) {
      drawEntry(b, f);
      const page = b.pageNumber;
      const traitKey = f.trait.trim();
      if (traitKey) traitPages.set(traitKey, [...(traitPages.get(traitKey) ?? []), page]);
      const charKey = f.character?.trim();
      if (charKey) charPages.set(charKey, [...(charPages.get(charKey) ?? []), page]);
    }
  }

  b.startChapter("index-trait", "Index by Trait");
  b.paragraph("Every distinct trait referenced in this book, with the page(s) where a formation illustrating it appears.", {
    size: 8.5,
    italic: true,
    color: [128, 120, 112],
  });
  b.spacer(2);
  for (const term of Array.from(traitPages.keys()).sort((a, c) => a.localeCompare(c, undefined, { sensitivity: "base" }))) {
    b.indexRow(term, traitPages.get(term)!);
  }

  b.startChapter("index-character", "Index by Character");
  b.paragraph(
    "Every distinct character referenced in this book, with the page(s) where a formation illustrating it appears.",
    { size: 8.5, italic: true, color: [128, 120, 112] },
  );
  b.spacer(2);
  for (const term of Array.from(charPages.keys()).sort((a, c) => a.localeCompare(c, undefined, { sensitivity: "base" }))) {
    b.indexRow(term, charPages.get(term)!);
  }

  b.finalize();
  const dateStr = new Date().toISOString().slice(0, 10);
  b.save(`${slugify(title)}-${dateStr}.pdf`);

  return { includedCount: included.length };
}
