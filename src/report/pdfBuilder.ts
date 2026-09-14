import { jsPDF } from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";

export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN = 18;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const CONTENT_TOP = 26;
export const CONTENT_BOTTOM = 266;
const FOOTER_RULE_Y = 278;
const FOOTER_TEXT_Y = 284;
const HEADER_TEXT_Y = 12;
const HEADER_RULE_Y = 16;

type RGB = [number, number, number];

export const COLORS = {
  accent: [141, 127, 214] as RGB,
  accentDark: [110, 95, 196] as RGB,
  textStrong: [44, 42, 61] as RGB,
  textBody: [74, 70, 94] as RGB,
  textMuted: [131, 126, 153] as RGB,
  divider: [230, 225, 245] as RGB,
  surfaceAlt: [243, 241, 251] as RGB,
  success: [111, 184, 148] as RGB,
  successBg: [226, 244, 234] as RGB,
  warning: [217, 162, 79] as RGB,
  warningBg: [250, 240, 220] as RGB,
  danger: [217, 127, 127] as RGB,
  dangerBg: [251, 232, 232] as RGB,
  blush: [138, 52, 85] as RGB,
  blushBg: [252, 238, 242] as RGB,
  white: [255, 255, 255] as RGB,
};

interface SectionEntry {
  id: string;
  title: string;
  page: number;
}

/**
 * Wraps jsPDF with the layout primitives needed for a properly formatted,
 * multi-page report: a reserved running header/footer band on every content
 * page, automatic pagination, a section registry used to build a hyperlinked
 * Table of Contents, and a "Home" link on every page that returns to the
 * exact TOC line for that section (not just the top of the index).
 */
export class PdfReportBuilder {
  doc: jsPDF;
  y = CONTENT_TOP;
  private currentSectionTitle = "";
  private currentSectionId = "";
  sections: SectionEntry[] = [];
  private pageSectionTitle: Record<number, string> = {};
  private pageSectionId: Record<number, string> = {};
  readonly tocPage = 2;
  private reportTitle: string;

  constructor(reportTitle: string) {
    this.doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    this.reportTitle = reportTitle;
  }

  get pageNumber(): number {
    return this.doc.getNumberOfPages();
  }

  private setTextColor(c: RGB) {
    this.doc.setTextColor(c[0], c[1], c[2]);
  }
  private setDrawColor(c: RGB) {
    this.doc.setDrawColor(c[0], c[1], c[2]);
  }
  private setFillColor(c: RGB) {
    this.doc.setFillColor(c[0], c[1], c[2]);
  }

  addPage(): void {
    this.doc.addPage();
    this.y = CONTENT_TOP;
    const n = this.pageNumber;
    if (this.currentSectionTitle) {
      this.pageSectionTitle[n] = this.currentSectionTitle;
      this.pageSectionId[n] = this.currentSectionId;
    }
  }

  ensureSpace(h: number): void {
    if (this.y + h > CONTENT_BOTTOM) this.addPage();
  }

  /** Reserves page 2 as the Table of Contents, filled in by finalize(). */
  reserveTocPage(): void {
    this.addPage();
  }

  /** Starts a new top-level, TOC-indexed section on its own fresh page. */
  startSection(id: string, title: string): void {
    this.addPage();
    this.currentSectionTitle = title;
    this.currentSectionId = id;
    const page = this.pageNumber;
    this.sections.push({ id, title, page });
    this.pageSectionTitle[page] = title;
    this.pageSectionId[page] = id;

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(16.5);
    this.setTextColor(COLORS.textStrong);
    this.doc.text(title, MARGIN, this.y);
    this.y += 2.5;
    this.setDrawColor(COLORS.accent);
    this.doc.setLineWidth(1);
    this.doc.line(MARGIN, this.y, MARGIN + 16, this.y);
    this.y += 9;
  }

  heading(text: string, size = 11.5): void {
    this.ensureSpace(9);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(size);
    this.setTextColor(COLORS.textStrong);
    this.doc.text(text, MARGIN, this.y);
    this.y += size * 0.55;
  }

  paragraph(
    text: string,
    opts: { size?: number; color?: RGB; gap?: number; italic?: boolean; bold?: boolean; maxWidth?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const color = opts.color ?? COLORS.textBody;
    const gap = opts.gap ?? size * 0.52;
    this.doc.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    this.doc.setFontSize(size);
    this.setTextColor(color);
    const lines = this.doc.splitTextToSize(text, opts.maxWidth ?? CONTENT_W) as string[];
    for (const line of lines) {
      this.ensureSpace(gap);
      this.doc.text(line, MARGIN, this.y);
      this.y += gap;
    }
  }

  bulletList(items: string[], opts: { size?: number; color?: RGB } = {}): void {
    const size = opts.size ?? 9.5;
    const color = opts.color ?? COLORS.textBody;
    const indent = 5;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(size);
    this.setTextColor(color);
    for (const item of items) {
      const lines = this.doc.splitTextToSize(item, CONTENT_W - indent) as string[];
      this.ensureSpace(lines.length * size * 0.52 + 1);
      this.doc.text("•", MARGIN, this.y);
      for (let i = 0; i < lines.length; i += 1) {
        this.doc.text(lines[i], MARGIN + indent, this.y);
        this.y += size * 0.52;
      }
      this.y += 1;
    }
  }

  spacer(h = 4): void {
    this.y += h;
  }

  divider(): void {
    this.ensureSpace(5);
    this.setDrawColor(COLORS.divider);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 5;
  }

  /** A grid of small stat tiles, e.g. Scan Readability / Confidence / ... */
  statGrid(items: { label: string; value: string }[], cols = 3): void {
    const gap = 4;
    const tileW = (CONTENT_W - gap * (cols - 1)) / cols;
    const tileH = 17;
    const rows = Math.ceil(items.length / cols);
    this.ensureSpace(rows * (tileH + gap));
    for (let i = 0; i < items.length; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MARGIN + col * (tileW + gap);
      const rowTop = this.y + row * (tileH + gap);
      this.setFillColor(COLORS.surfaceAlt);
      this.doc.roundedRect(x, rowTop, tileW, tileH, 2, 2, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(13);
      this.setTextColor(COLORS.accentDark);
      this.doc.text(items[i].value, x + 4, rowTop + 8);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7.5);
      this.setTextColor(COLORS.textMuted);
      this.doc.text(items[i].label, x + 4, rowTop + 13.5);
    }
    this.y += rows * (tileH + gap);
  }

  /** A soft-background callout box (used for contradictions, disclaimer, privacy note). */
  calloutBox(text: string, opts: { bg?: RGB; textColor?: RGB; title?: string } = {}): void {
    const bg = opts.bg ?? COLORS.surfaceAlt;
    const textColor = opts.textColor ?? COLORS.textBody;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    const lines = this.doc.splitTextToSize(text, CONTENT_W - 10) as string[];
    const titleH = opts.title ? 6 : 0;
    const boxH = 6 + titleH + lines.length * 4.6 + 4;
    this.ensureSpace(boxH + 3);
    this.setFillColor(bg);
    this.doc.roundedRect(MARGIN, this.y, CONTENT_W, boxH, 2.5, 2.5, "F");
    let ty = this.y + 6.5;
    if (opts.title) {
      this.doc.setFont("helvetica", "bold");
      this.setTextColor(textColor);
      this.doc.text(opts.title, MARGIN + 5, ty);
      ty += 6;
    }
    this.doc.setFont("helvetica", "normal");
    this.setTextColor(textColor);
    for (const line of lines) {
      this.doc.text(line, MARGIN + 5, ty);
      ty += 4.6;
    }
    this.y += boxH + 6;
  }

  /** Two-up cards with a title, a bold value and a short description (used for trait cards). */
  cardGrid(cards: { title: string; value?: string; body: string; badge?: string }[], cols = 2): void {
    const gap = 4;
    const colW = (CONTENT_W - gap * (cols - 1)) / cols;
    const colHeights: number[] = new Array(cols).fill(0);
    const measured = cards.map((c) => {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      const lines = this.doc.splitTextToSize(c.body, colW - 8) as string[];
      const h = 8 + lines.length * 4 + 4;
      return { ...c, lines, h };
    });

    for (const c of measured) {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = MARGIN + col * (colW + gap);
      this.ensureSpaceForCard(c.h, colHeights);
      const rowTop = this.y + colHeights[col];
      this.setFillColor(COLORS.surfaceAlt);
      this.doc.roundedRect(x, rowTop, colW, c.h, 2, 2, "F");
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(9.5);
      this.setTextColor(COLORS.textStrong);
      this.doc.text(c.title, x + 4, rowTop + 6);
      if (c.value) {
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(9.5);
        this.setTextColor(COLORS.accentDark);
        const vw = this.doc.getTextWidth(c.value);
        this.doc.text(c.value, x + colW - 4 - vw, rowTop + 6);
      }
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      this.setTextColor(COLORS.textBody);
      let ty = rowTop + 11;
      for (const line of c.lines) {
        this.doc.text(line, x + 4, ty);
        ty += 4;
      }
      colHeights[col] += c.h + gap;
    }
    this.y += Math.max(...colHeights);
  }

  private ensureSpaceForCard(h: number, colHeights: number[]): void {
    const projected = this.y + Math.min(...colHeights) + h;
    if (projected > CONTENT_BOTTOM) {
      this.addPage();
      for (let i = 0; i < colHeights.length; i += 1) colHeights[i] = 0;
    }
  }

  image(dataUrl: string, maxWidthMm: number, maxHeightMm: number): void {
    try {
      const props = this.doc.getImageProperties(dataUrl);
      let w = maxWidthMm;
      let h = (props.height / props.width) * w;
      if (h > maxHeightMm) {
        h = maxHeightMm;
        w = (props.width / props.height) * h;
      }
      this.ensureSpace(h + 4);
      this.doc.addImage(dataUrl, "PNG", MARGIN, this.y, w, h);
      this.y += h + 6;
    } catch {
      // best-effort embed; skip silently on failure
    }
  }

  table(head: string[], rows: (string | number)[][], opts: Partial<UserOptions> = {}): void {
    const startPage = this.pageNumber;
    autoTable(this.doc, {
      head: [head],
      body: rows,
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN, top: CONTENT_TOP, bottom: PAGE_H - CONTENT_BOTTOM },
      styles: {
        font: "helvetica",
        fontSize: 8,
        textColor: COLORS.textBody,
        cellPadding: 2.2,
        lineColor: COLORS.divider,
        lineWidth: 0.2,
        overflow: "linebreak",
      },
      headStyles: { fillColor: COLORS.accent, textColor: COLORS.white, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: COLORS.surfaceAlt },
      didDrawPage: () => {
        const n = this.pageNumber;
        if (n > startPage) {
          this.pageSectionTitle[n] = this.currentSectionTitle;
          this.pageSectionId[n] = this.currentSectionId;
        }
      },
      ...opts,
    });
    const withLast = this.doc as unknown as { lastAutoTable?: { finalY: number } };
    this.y = (withLast.lastAutoTable?.finalY ?? this.y) + 7;
  }

  private drawHeader(sectionLabel: string): void {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.setTextColor(COLORS.textMuted);
    this.doc.text(this.reportTitle, MARGIN, HEADER_TEXT_Y);

    if (sectionLabel) {
      this.doc.setFont("helvetica", "normal");
      this.setTextColor(COLORS.textMuted);
      const w = this.doc.getTextWidth(sectionLabel);
      this.doc.text(sectionLabel, PAGE_W - MARGIN - 20 - w, HEADER_TEXT_Y);
    }

    this.setDrawColor(COLORS.divider);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, HEADER_RULE_Y, PAGE_W - MARGIN, HEADER_RULE_Y);
  }

  private drawHomeLink(targetTop: number): void {
    const label = "Index";
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8.5);
    this.setTextColor(COLORS.accentDark);
    const w = this.doc.getTextWidth(label);
    const x = PAGE_W - MARGIN - w;
    this.doc.text(label, x, HEADER_TEXT_Y);
    this.setDrawColor(COLORS.accentDark);
    this.doc.setLineWidth(0.4);
    this.doc.line(x, HEADER_TEXT_Y + 1, x + w, HEADER_TEXT_Y + 1);
    this.doc.link(x - 2, HEADER_TEXT_Y - 4, w + 4, 6, { pageNumber: this.tocPage, top: targetTop, magFactor: "XYZ" });
  }

  private drawFooter(pageNo: number, totalPages: number): void {
    this.setDrawColor(COLORS.divider);
    this.doc.setLineWidth(0.3);
    this.doc.line(MARGIN, FOOTER_RULE_Y, PAGE_W - MARGIN, FOOTER_RULE_Y);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7.5);
    this.setTextColor(COLORS.textMuted);
    this.doc.text("Graphology Analyzer — confidential analysis report", MARGIN, FOOTER_TEXT_Y);

    const pageLabel = `Page ${pageNo} of ${totalPages}`;
    const w = this.doc.getTextWidth(pageLabel);
    this.doc.text(pageLabel, PAGE_W - MARGIN - w, FOOTER_TEXT_Y);
  }

  /**
   * Renders the Table of Contents onto the reserved TOC page and stamps a
   * running header/footer + "Index" home link onto every content page. Must
   * be called once, after all sections have been rendered.
   */
  finalize(): void {
    const totalPages = this.pageNumber;
    const doc = this.doc;

    doc.setPage(this.tocPage);
    let ty = CONTENT_TOP + 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    this.setTextColor(COLORS.textStrong);
    doc.text("Table of Contents", MARGIN, ty);
    ty += 3;
    this.setDrawColor(COLORS.accent);
    doc.setLineWidth(1);
    doc.line(MARGIN, ty, MARGIN + 18, ty);
    ty += 14;

    const tocRowY: Record<string, number> = {};
    for (const s of this.sections) {
      const rowTop = ty - 5;
      tocRowY[s.id] = ty - 1.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11.5);
      this.setTextColor(COLORS.textBody);
      doc.text(s.title, MARGIN, ty);

      const numText = String(s.page);
      doc.setFont("helvetica", "bold");
      this.setTextColor(COLORS.accentDark);
      const numWidth = doc.getTextWidth(numText);
      doc.text(numText, PAGE_W - MARGIN - numWidth, ty);

      const titleWidth = doc.getTextWidth(s.title);
      const leaderStart = MARGIN + titleWidth + 3;
      const leaderEnd = PAGE_W - MARGIN - numWidth - 4;
      if (leaderEnd > leaderStart) {
        this.setDrawColor(COLORS.divider);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([0.5, 1.3], 0);
        doc.line(leaderStart, ty - 1, leaderEnd, ty - 1);
        doc.setLineDashPattern([], 0);
      }

      doc.link(MARGIN, rowTop, PAGE_W - MARGIN * 2, 9, { pageNumber: s.page });
      ty += 10.5;
    }

    for (let p = 1; p <= totalPages; p += 1) {
      doc.setPage(p);
      if (p === 1) {
        this.drawFooter(p, totalPages);
        continue;
      }
      if (p === this.tocPage) {
        this.drawFooter(p, totalPages);
        continue;
      }
      const sectionId = this.pageSectionId[p] ?? "";
      const sectionTitle = this.pageSectionTitle[p] ?? "";
      this.drawHeader(sectionTitle);
      this.drawFooter(p, totalPages);
      this.drawHomeLink(tocRowY[sectionId] ?? CONTENT_TOP);
    }
  }

  save(filename: string): void {
    this.doc.save(filename);
  }
}
