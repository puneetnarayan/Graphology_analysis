import { jsPDF } from "jspdf";
import type { AnalysisReport } from "@/types";

const MARGIN = 15;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export function exportReportToPdf(report: AnalysisReport, previewDataUrl: string | null): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > 285) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const heading = (text: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(45, 40, 70);
    doc.text(text, MARGIN, y);
    y += 7;
    doc.setDrawColor(230, 225, 245);
    doc.line(MARGIN, y - 3, PAGE_WIDTH - MARGIN, y - 3);
  };

  const body = (text: string, size = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(60, 55, 80);
    const wrapped = doc.splitTextToSize(text, CONTENT_WIDTH);
    for (const line of wrapped) {
      ensureSpace(6);
      doc.text(line, MARGIN, y);
      y += 5.2;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(141, 127, 214);
  doc.text("Graphology Analysis Report", MARGIN, y);
  y += 9;
  body(`Generated ${new Date(report.generatedAt).toLocaleString()} · Engine v${report.engineVersion} · Rules v${report.ruleLibraryVersion}`, 9);
  y += 3;

  if (previewDataUrl) {
    try {
      const imgProps = doc.getImageProperties(previewDataUrl);
      const w = CONTENT_WIDTH * 0.7;
      const h = (imgProps.height / imgProps.width) * w;
      ensureSpace(h + 5);
      doc.addImage(previewDataUrl, "PNG", MARGIN, y, w, Math.min(h, 90));
      y += Math.min(h, 90) + 6;
    } catch {
      // image embedding is best-effort; skip silently if it fails
    }
  }

  heading("Summary");
  body(
    `Sample: ${report.sampleMetadata.filename} (${report.sampleMetadata.width}×${report.sampleMetadata.height}px)\n` +
      `Scan readability: ${report.scanQuality.overallScore}% (${report.scanQuality.overallClass})\n` +
      `Overall analysis confidence: ${report.overallConfidence}%\n` +
      `Lines: ${report.linesDetected}  Words: ${report.wordsDetected}  Components: ${report.lettersDetected}`,
  );
  y += 2;

  heading("Executive Profile");
  for (const t of report.traitScores.filter((t) => t.available)) {
    body(`${t.label}: ${t.score}/100 (confidence ${t.confidence}%)`, 10.5);
    body(t.synthesisText, 9);
    y += 1;
  }

  if (report.contradictions.length) {
    heading("Contradictions & Nuances");
    for (const c of report.contradictions) {
      body(`${c.description}: ${c.resolutionText}`, 9.5);
    }
  }

  heading("Observed Handwriting Characteristics");
  for (const f of Object.values(report.features)) {
    body(`${f.label}: ${f.available ? "Available" : `Unavailable — ${f.unavailableReason}`}`, 9.5);
  }

  heading("Handwriting Evidence (Rules & Contributions)");
  for (const e of report.evidence.slice(0, 60)) {
    body(`${e.id}  ${e.featureKey} — ${e.measurement}  (${(e.confidence * 100).toFixed(0)}% conf, rule ${e.ruleId}, contribution ${e.ruleContribution.toFixed(2)})`, 8.5);
  }
  if (report.evidence.length > 60) {
    body(`…and ${report.evidence.length - 60} more evidence entries (see JSON export for the complete list).`, 8.5);
  }

  heading("Limitations");
  body(
    "Scan quality varies by region; low-confidence regions are flagged rather than silently discarded. Pressure is an image-derived proxy, not a physical pressure measurement. Automated letter/signature identification may be uncertain.",
  );
  if (report.userOverrideCount > 0) body(`User overrides applied: ${report.userOverrideCount}`);

  heading("Disclaimer");
  body(
    "This report presents graphological interpretations based on traditional graphology literature and a deterministic rule engine. It is not a clinical psychological diagnosis and has not been scientifically validated as a personality assessment method. It should not be used for employment, credit, insurance, legal, medical or psychiatric decisions.",
    9,
  );

  doc.save(`graphology-report-${report.sampleMetadata.filename.replace(/\.[^.]+$/, "")}.pdf`);
}
