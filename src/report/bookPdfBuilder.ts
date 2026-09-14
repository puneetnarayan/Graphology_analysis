import { jsPDF } from "jspdf";

/** 6 x 9 inch trim size in mm — the most common KDP paperback trim. */
export const BOOK_PAGE_W = 152.4;
export const BOOK_PAGE_H = 228.6;

/**
 * Outer margin (top/bottom/outside-edge) and inner margin (the binding-side
 * gutter). The gutter is generous enough to stay within KDP's minimum
 * requirement across the whole page-count range that requires the largest
 * gutter (up to ~700 pages) — safe regardless of how big the final book
 * turns out to be, at the cost of a bit more inner white space than a
 * shorter book strictly needs. Margins mirror left/right by odd/even page
 * (recto pages carry the gutter on the left, verso pages on the right) so
 * the printed text block sits centered relative to the bound page.
 */
const OUTSIDE_MARGIN = 15;
const GUTTER_MARGIN = 20;
export const BOOK_CONTENT_W = BOOK_PAGE_W - OUTSIDE_MARGIN - GUTTER_MARGIN;
const CONTENT_TOP = 24;
const CONTENT_BOTTOM = BOOK_PAGE_H - 20;
const HEADER_TEXT_Y = 12;
const HEADER_RULE_Y = 16;
const FOOTER_RULE_Y = BOOK_PAGE_H - 16;
const FOOTER_TEXT_Y = BOOK_PAGE_H - 10;

export type RGB = [number, number, number];

const INK: RGB = [30, 27, 24];
const INK_BODY: RGB = [55, 50, 46];
const MUTED: RGB = [128, 120, 112];
const ACCENT: RGB = [138, 52, 85];
const ACCENT_DARK: RGB = [110, 40, 68];
const DIVIDER: RGB = [222, 213, 205];

/**
 * Print target used to size embedded images: they are only ever scaled
 * *down* to fit a requested box, never up past their native pixel density
 * at this DPI — which is what causes visible pixelation. A low-resolution
 * source image simply prints smaller (and stays sharp) instead of being
 * blown up blurry.
 */
const TARGET_PRINT_DPI = 300;
const MM_PER_INCH = 25.4;

interface ChapterEntry {
  id: string;
  title: string;
  page: number;
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "JPEG";
}

/**
 * A print-book-shaped PDF builder: 6x9in trim, mirrored inner/outer margins,
 * a Table of Contents whose page count is reserved up front (computed from
 * the known chapter title list, so no more reservation than needed), a
 * running chapter-title header with a hyperlink back to that chapter's own
 * Contents row, and index rows with per-page hyperlinks — everything a KDP
 * paperback interior file needs plus working links for anyone reading the
 * PDF on screen.
 */
export class BookPdfBuilder {
  doc: jsPDF;
  y = CONTENT_TOP;
  chapters: ChapterEntry[] = [];
  private currentChapterId = "";
  private currentChapterTitle = "";
  private pageChapterId: Record<number, string> = {};
  private pageChapterTitle: Record<number, string> = {};
  private tocRowRef: Record<string, { page: number; y: number }> = {};
  tocStartPage = 0;
  private tocPageCount = 0;
  /** Pages with no header/footer/page-number at all: covers, title page, copyright page. */
  private chromeFreePages = new Set<number>();

  constructor(private bookTitle: string) {
    this.doc = new jsPDF({ unit: "mm", format: [BOOK_PAGE_W, BOOK_PAGE_H], compress: true });
  }

  get pageNumber(): number {
    return this.doc.getNumberOfPages();
  }

  private isRecto(page: number = this.pageNumber): boolean {
    return page % 2 === 1;
  }

  /** Left edge of the text column on the given page — mirrors by odd/even page for binding. */
  contentLeft(page: number = this.pageNumber): number {
    return this.isRecto(page) ? GUTTER_MARGIN : OUTSIDE_MARGIN;
  }

  /** Marks the current page as chrome-free (no running header/footer/page number). */
  markChromeFree(): void {
    this.chromeFreePages.add(this.pageNumber);
  }

  private frontPageClaimed = false;

  /**
   * Claims the current page for a free-standing front-matter block (cover,
   * title page). jsPDF always creates page 1 up front whether it's used or
   * not — the first caller of claimPage() gets to use that pre-existing
   * page 1 directly; every caller after that gets a fresh page instead, so
   * a cover and the title page never end up drawn on top of each other, and
   * page 1 is never left blank and wasted when nothing claims it first.
   */
  claimPage(): void {
    if (this.pageNumber === 1 && !this.frontPageClaimed) {
      this.frontPageClaimed = true;
      return;
    }
    this.addPage();
  }

  private setTextColor(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }
  private setDrawColor(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2]);
  }

  addPage(): void {
    this.doc.addPage([BOOK_PAGE_W, BOOK_PAGE_H]);
    this.y = CONTENT_TOP;
    const n = this.pageNumber;
    if (this.currentChapterTitle) {
      this.pageChapterTitle[n] = this.currentChapterTitle;
      this.pageChapterId[n] = this.currentChapterId;
    }
  }

  ensureSpace(h: number): void {
    if (this.y + h > CONTENT_BOTTOM) this.addPage();
  }

  /**
   * Reserves exactly as many pages as the given chapter titles need to list
   * (measured against actual text-wrapping), placed right after whatever
   * pages already exist (title + copyright, typically). Call once, before
   * startChapter(), with the full final list of chapter titles including
   * any back-matter "chapters" like an index.
   */
  reserveToc(chapterTitles: string[]): void {
    this.tocStartPage = this.pageNumber + 1;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(11);
    let ty = CONTENT_TOP + 16;
    let pages = 1;
    for (const title of chapterTitles) {
      const lines = this.doc.splitTextToSize(title, BOOK_CONTENT_W - 14) as string[];
      const rowH = Math.max(1, lines.length) * 5.2 + 1.5;
      if (ty + rowH > CONTENT_BOTTOM) {
        pages += 1;
        ty = CONTENT_TOP + 12;
      }
      ty += rowH;
    }
    this.tocPageCount = pages;
    for (let i = 0; i < pages; i += 1) this.addPage();
  }

  /** Starts a new top-level, TOC-indexed chapter on its own fresh page. */
  startChapter(id: string, title: string): void {
    this.addPage();
    this.currentChapterId = id;
    this.currentChapterTitle = title;
    const page = this.pageNumber;
    this.chapters.push({ id, title, page });
    this.pageChapterTitle[page] = title;
    this.pageChapterId[page] = id;

    this.doc.setFont("times", "bold");
    this.doc.setFontSize(18);
    this.setTextColor(INK);
    const x = this.contentLeft(page);
    const lines = this.doc.splitTextToSize(title, BOOK_CONTENT_W) as string[];
    for (const line of lines) {
      this.doc.text(line, x, this.y);
      this.y += 8;
    }
    this.y += 1;
    this.setDrawColor(ACCENT);
    this.doc.setLineWidth(1);
    this.doc.line(x, this.y, x + 16, this.y);
    this.y += 10;
  }

  /** An inline sub-heading within a chapter (not a TOC entry, just a visual grouping label). */
  subheading(text: string): void {
    if (!text) return;
    this.ensureSpace(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(10.5);
    this.setTextColor(ACCENT_DARK);
    const x = this.contentLeft();
    const lines = this.doc.splitTextToSize(text, BOOK_CONTENT_W) as string[];
    for (const line of lines) {
      this.doc.text(line, x, this.y);
      this.y += 5.2;
    }
    this.y += 2;
  }

  paragraph(
    text: string,
    opts: { size?: number; color?: RGB; gap?: number; italic?: boolean; bold?: boolean; font?: "times" | "helvetica" } = {},
  ): void {
    if (!text) return;
    const size = opts.size ?? 9.5;
    const color = opts.color ?? INK_BODY;
    const gap = opts.gap ?? size * 0.5;
    const font = opts.font ?? "times";
    this.doc.setFont(font, opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    this.doc.setFontSize(size);
    this.setTextColor(color);
    const lines = this.doc.splitTextToSize(text, BOOK_CONTENT_W) as string[];
    for (const line of lines) {
      this.ensureSpace(gap);
      this.doc.text(line, this.contentLeft(), this.y);
      this.y += gap;
    }
    this.y += 1.5;
  }

  spacer(h = 4): void {
    this.y += h;
  }

  divider(): void {
    this.ensureSpace(4);
    this.setDrawColor(DIVIDER);
    this.doc.setLineWidth(0.3);
    const x = this.contentLeft();
    this.doc.line(x, this.y, x + BOOK_CONTENT_W, this.y);
    this.y += 4;
  }

  /**
   * Computes the mm size an image should print at to fit within the given
   * box. By default (allowUpscale=1) it never exceeds the image's native
   * pixel density at TARGET_PRINT_DPI — the box is a ceiling, not a target,
   * so a low-resolution source image ends up smaller than the box (and
   * sharp) rather than upscaled (and pixelated). Pass allowUpscale > 1 to
   * deliberately permit printing larger than native resolution — a
   * conscious trade of sharpness for size, left to the caller to decide.
   */
  measureImageBox(dataUrl: string, maxWidthMm: number, maxHeightMm: number, allowUpscale = 1): { w: number; h: number } {
    const props = this.doc.getImageProperties(dataUrl);
    const boxMaxWpx = (maxWidthMm / MM_PER_INCH) * TARGET_PRINT_DPI;
    const boxMaxHpx = (maxHeightMm / MM_PER_INCH) * TARGET_PRINT_DPI;
    const scale = Math.min(allowUpscale, boxMaxWpx / props.width, boxMaxHpx / props.height);
    const wPx = props.width * scale;
    const hPx = props.height * scale;
    return { w: (wPx / TARGET_PRINT_DPI) * MM_PER_INCH, h: (hPx / TARGET_PRINT_DPI) * MM_PER_INCH };
  }

  /** Draws an image at an exact position/size with no pagination or cursor advance — for custom layouts. */
  drawImageBox(dataUrl: string, x: number, y: number, w: number, h: number): void {
    try {
      this.doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), x, y, w, h);
    } catch {
      // best-effort embed; skip silently on failure
    }
  }

  image(dataUrl: string, maxWidthMm: number, maxHeightMm: number): void {
    const { w, h } = this.measureImageBox(dataUrl, maxWidthMm, maxHeightMm);
    if (w <= 0 || h <= 0) return;
    this.ensureSpace(h + 4);
    this.drawImageBox(dataUrl, this.contentLeft(), this.y, w, h);
    this.y += h + 5;
  }

  /** Splits text into wrapped lines for a column of the given width, without drawing. */
  measureParagraphLines(text: string, width: number, size: number, font: "times" | "helvetica" = "times", bold = false): string[] {
    if (!text) return [];
    this.doc.setFont(font, bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    return this.doc.splitTextToSize(text, width) as string[];
  }

  /** Draws pre-split lines starting at an exact x/y (a text column beside an image); returns the y after. */
  drawParagraphLines(
    lines: string[],
    x: number,
    y: number,
    opts: { size?: number; color?: RGB; italic?: boolean; bold?: boolean; font?: "times" | "helvetica" } = {},
  ): number {
    const size = opts.size ?? 9.5;
    const font = opts.font ?? "times";
    this.doc.setFont(font, opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    this.doc.setFontSize(size);
    this.setTextColor(opts.color ?? INK_BODY);
    let ty = y;
    const lineGap = size * 0.52;
    for (const line of lines) {
      this.doc.text(line, x, ty);
      ty += lineGap;
    }
    return ty;
  }

  /**
   * A full-bleed image page (front/back cover artwork) — fitted within the
   * whole trim size (no text margins), centered, never cropped. Added as
   * its own page and marked chrome-free (no header/footer/page number).
   * An optional barcode image is overlaid in the bottom-right corner (the
   * conventional spot for an ISBN barcode on a back cover).
   */
  addCoverPage(dataUrl: string, barcodeDataUrl?: string | null): void {
    this.claimPage();
    try {
      const props = this.doc.getImageProperties(dataUrl);
      const scale = Math.min(BOOK_PAGE_W / props.width, BOOK_PAGE_H / props.height);
      const w = props.width * scale;
      const h = props.height * scale;
      const x = (BOOK_PAGE_W - w) / 2;
      const y = (BOOK_PAGE_H - h) / 2;
      this.doc.addImage(dataUrl, imageFormatFromDataUrl(dataUrl), x, y, w, h);
    } catch {
      // best-effort embed; leave the page blank on failure
    }
    if (barcodeDataUrl) {
      const margin = 10;
      const box = this.measureImageBox(barcodeDataUrl, 32, 20, 2);
      this.drawImageBox(barcodeDataUrl, BOOK_PAGE_W - margin - box.w, BOOK_PAGE_H - margin - box.h, box.w, box.h);
    }
    this.markChromeFree();
  }

  /** One back-of-book index row: "Term ....... 4, 9, 17" with each page number individually hyperlinked. */
  indexRow(term: string, pages: number[]): void {
    const size = 9.5;
    const uniquePages = Array.from(new Set(pages)).sort((a, b) => a - b);
    this.ensureSpace(size * 0.6 + 2);
    const x = this.contentLeft();

    this.doc.setFont("times", "normal");
    this.doc.setFontSize(size);
    this.setTextColor(INK_BODY);
    this.doc.text(term, x, this.y);
    const termW = this.doc.getTextWidth(term);

    this.doc.setFont("helvetica", "bold");
    const parts = uniquePages.map((p, i) => (i < uniquePages.length - 1 ? `${p}, ` : `${p}`));
    const totalW = parts.reduce((sum, p) => sum + this.doc.getTextWidth(p), 0);
    let cx = x + BOOK_CONTENT_W - totalW;

    const leaderStart = x + termW + 2;
    const leaderEnd = cx - 2;
    if (leaderEnd > leaderStart) {
      this.setDrawColor(DIVIDER);
      this.doc.setLineWidth(0.3);
      this.doc.setLineDashPattern([0.4, 1.2], 0);
      this.doc.line(leaderStart, this.y - 1, leaderEnd, this.y - 1);
      this.doc.setLineDashPattern([], 0);
    }

    for (let i = 0; i < uniquePages.length; i += 1) {
      const p = uniquePages[i];
      const label = parts[i];
      const numOnlyW = this.doc.getTextWidth(String(p));
      this.setTextColor(ACCENT_DARK);
      this.doc.text(label, cx, this.y);
      this.doc.link(cx - 0.5, this.y - 3.2, numOnlyW + 1, 4.2, { pageNumber: p });
      cx += this.doc.getTextWidth(label);
    }
    this.y += size * 0.6;
  }

  private drawHeader(pageNo: number, chapterTitle: string): void {
    const x = this.contentLeft(pageNo);
    this.doc.setFont("times", "italic");
    this.doc.setFontSize(8.5);
    this.setTextColor(MUTED);
    this.doc.text(chapterTitle || this.bookTitle, x, HEADER_TEXT_Y);

    const ref = this.tocRowRef[this.pageChapterId[pageNo] ?? ""];
    if (ref) {
      const label = "Contents";
      this.doc.setFont("helvetica", "bold");
      this.setTextColor(ACCENT_DARK);
      const w = this.doc.getTextWidth(label);
      const rx = x + BOOK_CONTENT_W - w;
      this.doc.text(label, rx, HEADER_TEXT_Y);
      this.doc.link(rx - 2, HEADER_TEXT_Y - 4, w + 4, 6, { pageNumber: ref.page, top: ref.y });
    }

    this.setDrawColor(DIVIDER);
    this.doc.setLineWidth(0.3);
    this.doc.line(x, HEADER_RULE_Y, x + BOOK_CONTENT_W, HEADER_RULE_Y);
  }

  private drawFooter(pageNo: number): void {
    const x = this.contentLeft(pageNo);
    this.setDrawColor(DIVIDER);
    this.doc.setLineWidth(0.3);
    this.doc.line(x, FOOTER_RULE_Y, x + BOOK_CONTENT_W, FOOTER_RULE_Y);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.setTextColor(MUTED);
    const label = String(pageNo);
    const w = this.doc.getTextWidth(label);
    this.doc.text(label, x + BOOK_CONTENT_W / 2 - w / 2, FOOTER_TEXT_Y);
  }

  /**
   * Renders the Contents page(s) reserved by reserveToc() (now that every
   * chapter's actual starting page is known) and stamps the running
   * header/footer, page numbers, and Contents-back-link onto every page.
   * Must be called once, after every chapter has been started.
   */
  finalize(): void {
    const totalPages = this.pageNumber;
    const doc = this.doc;

    let curTocPage = this.tocStartPage;
    doc.setPage(curTocPage);
    let ty = CONTENT_TOP;

    const drawHeading = (continued: boolean) => {
      doc.setFont("times", "bold");
      doc.setFontSize(continued ? 13 : 19);
      this.setTextColor(INK);
      const x = this.contentLeft(curTocPage);
      doc.text(continued ? "Contents (continued)" : "Contents", x, ty);
      if (!continued) {
        ty += 3;
        this.setDrawColor(ACCENT);
        doc.setLineWidth(1);
        doc.line(x, ty, x + 18, ty);
        ty += 13;
      } else {
        ty += 8;
      }
    };
    drawHeading(false);

    for (const ch of this.chapters) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(ch.title, BOOK_CONTENT_W - 14) as string[];
      const rowH = Math.max(1, lines.length) * 5.2 + 1.5;
      if (ty + rowH > CONTENT_BOTTOM) {
        curTocPage += 1;
        doc.setPage(curTocPage);
        ty = CONTENT_TOP;
        drawHeading(true);
      }

      this.tocRowRef[ch.id] = { page: curTocPage, y: ty - 5 };
      const x = this.contentLeft(curTocPage);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      this.setTextColor(INK_BODY);
      doc.text(lines[0], x, ty);
      for (let i = 1; i < lines.length; i += 1) doc.text(lines[i], x, ty + i * 5.2);

      const numText = String(ch.page);
      doc.setFont("helvetica", "bold");
      this.setTextColor(ACCENT_DARK);
      const numW = doc.getTextWidth(numText);
      doc.text(numText, x + BOOK_CONTENT_W - numW, ty);

      const titleW = doc.getTextWidth(lines[0]);
      const leaderStart = x + titleW + 3;
      const leaderEnd = x + BOOK_CONTENT_W - numW - 4;
      if (leaderEnd > leaderStart) {
        this.setDrawColor(DIVIDER);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([0.5, 1.3], 0);
        doc.line(leaderStart, ty - 1, leaderEnd, ty - 1);
        doc.setLineDashPattern([], 0);
      }

      doc.link(x, ty - 5, BOOK_CONTENT_W, rowH, { pageNumber: ch.page });
      ty += rowH;
    }

    for (let p = 1; p <= totalPages; p += 1) {
      if (this.chromeFreePages.has(p)) continue;
      doc.setPage(p);
      const chapterTitle = this.pageChapterTitle[p] ?? "";
      this.drawHeader(p, chapterTitle);
      this.drawFooter(p);
    }
  }

  save(filename: string): void {
    this.doc.save(filename);
  }
}
