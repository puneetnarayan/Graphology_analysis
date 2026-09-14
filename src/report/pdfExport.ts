import { CONTENT_W, COLORS, PdfReportBuilder } from "./pdfBuilder";
import type { AnalysisReport } from "@/types";

function drawCover(b: PdfReportBuilder, report: AnalysisReport, previewDataUrl: string | null): void {
  const doc = b.doc;
  b.y = 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(COLORS.accentDark[0], COLORS.accentDark[1], COLORS.accentDark[2]);
  doc.text("Graphology Analysis Report", 18, b.y);
  b.y += 9;

  doc.setDrawColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
  doc.setLineWidth(1.2);
  doc.line(18, b.y, 18 + 28, b.y);
  b.y += 10;

  b.paragraph(`Sample: ${report.sampleMetadata.filename} (${report.sampleMetadata.width}×${report.sampleMetadata.height}px)`, {
    size: 10.5,
    color: COLORS.textBody,
  });
  b.paragraph(
    `Generated ${new Date(report.generatedAt).toLocaleString()} · Engine v${report.engineVersion} · Rules v${report.ruleLibraryVersion}`,
    { size: 9, color: COLORS.textMuted },
  );
  b.spacer(4);

  if (previewDataUrl) {
    b.image(previewDataUrl, CONTENT_W * 0.72, 82);
  }

  b.statGrid(
    [
      { label: "Scan Readability", value: `${report.scanQuality.overallScore}%` },
      { label: "Analysis Confidence", value: `${report.overallConfidence}%` },
      { label: "Lines / Words / Components", value: `${report.linesDetected} / ${report.wordsDetected} / ${report.lettersDetected}` },
      { label: "Evidence Regions", value: String(report.evidence.length) },
      { label: "Rules Triggered", value: String(report.ruleActivations.length) },
      { label: "User Overrides", value: String(report.userOverrideCount) },
    ],
    3,
  );

  b.spacer(2);
  b.calloutBox(
    "Your handwriting was analyzed locally in your browser and was not uploaded to a server or any external AI service.",
    { bg: COLORS.successBg, textColor: [47, 107, 77], title: "🔒 Privacy" },
  );
}

function drawExecutiveProfile(b: PdfReportBuilder, report: AnalysisReport): void {
  b.startSection("profile", "Executive Profile");
  b.paragraph(
    "A high-level profile based only on aggregated evidence from this sample. This is an interpretive graphological profile, not a clinical psychological assessment.",
    { size: 9.5, color: COLORS.textMuted },
  );
  b.spacer(3);

  const available = report.traitScores.filter((t) => t.available);
  b.cardGrid(
    available.map((t) => ({ title: t.label, value: `${t.score}/100`, body: t.synthesisText })),
    2,
  );

  const unavailableCount = report.traitScores.length - available.length;
  if (unavailableCount > 0) {
    b.spacer(2);
    b.paragraph(
      `${unavailableCount} additional dimension${unavailableCount === 1 ? "" : "s"} could not be characterized from this sample due to insufficient evidence.`,
      { size: 8.5, color: COLORS.textMuted, italic: true },
    );
  }
}

function drawContradictions(b: PdfReportBuilder, report: AnalysisReport): void {
  if (report.contradictions.length === 0) return;
  b.startSection("contradictions", "Contradictions & Nuances");
  b.paragraph("Competing indicators the synthesis reconciled rather than averaging away.", {
    size: 9.5,
    color: COLORS.textMuted,
  });
  b.spacer(3);
  for (const c of report.contradictions) {
    b.calloutBox(c.resolutionText, { bg: COLORS.blushBg, textColor: COLORS.blush, title: c.description });
  }
}

function drawScanQuality(b: PdfReportBuilder, report: AnalysisReport): void {
  b.startSection("quality", "Scan Quality");
  const q = report.scanQuality;
  b.statGrid(
    [
      { label: "Overall Readability", value: `${q.overallScore}%` },
      { label: "Classification", value: q.overallClass },
      { label: "Grid", value: `${q.gridRows} × ${q.gridCols} regions` },
    ],
    3,
  );
  b.spacer(3);
  b.heading("Component Averages");
  b.table(
    ["Component", "Average Score"],
    q.componentAverages.map((c) => [c.label, Math.round(c.score).toString()]),
  );

  b.heading("Feature Readiness");
  b.table(
    ["Feature", "Readability", "Readiness"],
    q.featureReadiness.map((f) => [f.label, f.readability === null ? "Not detected" : `${f.readability}%`, f.readiness]),
  );
}

function drawCharacteristics(b: PdfReportBuilder, report: AnalysisReport): void {
  b.startSection("characteristics", "Observed Handwriting Characteristics");
  b.paragraph("Detailed measurements for every feature module this engine attempted.", {
    size: 9.5,
    color: COLORS.textMuted,
  });
  b.spacer(2);
  b.table(
    ["Feature", "Status", "Detail"],
    Object.values(report.features).map((f) => [
      f.label,
      f.available ? "Measured" : "Insufficient evidence",
      f.available ? `Confidence ${Math.round((f.observation?.confidence ?? 0) * 100)}%` : (f.unavailableReason ?? ""),
    ]),
  );
}

function drawEvidenceAndRules(b: PdfReportBuilder, report: AnalysisReport, showCalculations: boolean): void {
  b.startSection("evidence", "Evidence & Rules");
  b.paragraph(
    "Every graphology rule that fired on this sample, with the weighting that determined how much it contributed to trait scores.",
    { size: 9.5, color: COLORS.textMuted },
  );
  b.spacer(2);
  if (showCalculations) {
    b.table(
      ["Rule ID", "Description", "Calculation", "Eff. Weight"],
      report.ruleActivations.map((r) => [
        r.ruleId,
        r.description,
        `${r.ruleWeight.toFixed(2)} × ${(r.observationConfidence * 100).toFixed(0)}% × ${(r.sampleSufficiency * 100).toFixed(0)}% × ${(r.imageQuality * 100).toFixed(0)}%`,
        r.effectiveWeight.toFixed(2),
      ]),
      { columnStyles: { 0: { cellWidth: 28 }, 2: { cellWidth: 44 }, 3: { cellWidth: 18 } } },
    );
    b.paragraph("Calculation = rule weight × observation confidence × sample sufficiency × scan quality.", {
      size: 7.5,
      color: COLORS.textMuted,
      italic: true,
    });
  } else {
    b.table(
      ["Rule ID", "Category", "Description", "Contribution"],
      report.ruleActivations.map((r) => [r.ruleId, r.category, r.description, r.effectiveWeight.toFixed(2)]),
      { columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 24 }, 3: { cellWidth: 22 } } },
    );
  }
}

function drawHandwritingPortions(b: PdfReportBuilder, report: AnalysisReport): void {
  b.startSection("portions", "Handwriting Portions Used");
  b.paragraph(
    "Full traceability: which handwriting portions were actually used, at what confidence, and what they contributed.",
    { size: 9.5, color: COLORS.textMuted },
  );
  b.spacer(2);
  b.table(
    ["ID", "Feature", "Measurement", "Conf.", "Rule", "Contrib.", "Interpretation"],
    report.evidence.map((e) => [
      e.id,
      e.featureKey,
      e.measurement,
      `${Math.round(e.confidence * 100)}%`,
      e.ruleId,
      e.ruleContribution.toFixed(2),
      e.interpretation,
    ]),
    {
      styles: { fontSize: 6.8, cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 16 },
        3: { cellWidth: 10 },
        4: { cellWidth: 20 },
        5: { cellWidth: 12 },
        6: { cellWidth: 56 },
      },
    },
  );
}

function drawLimitations(b: PdfReportBuilder, report: AnalysisReport): void {
  b.startSection("limitations", "Limitations");
  const items = [
    "Scan quality varies by region; low-confidence regions reduce confidence rather than being silently discarded.",
    "Pressure is an image-derived proxy, not a physical pen-pressure measurement.",
    "Automated letter, signature and connection-style identification is heuristic and may be uncertain; use manual overrides where available.",
    "Letter-connection, capital-letter and punctuation-specific detectors are not yet implemented in this release.",
    "The letter-shape distribution is a letter-agnostic geometric census (loop presence, zone extension), not per-letter OCR identification.",
  ];
  if (report.userOverrideCount > 0) items.push(`${report.userOverrideCount} observation(s) were manually overridden by the user.`);
  b.bulletList(items);
}

function drawDisclaimer(b: PdfReportBuilder): void {
  b.startSection("disclaimer", "Disclaimer");
  b.calloutBox(
    "This report presents graphological interpretations based on traditional graphology literature and a deterministic rule engine. Graphology's ability to infer personality has not been established as a reliable clinical psychological diagnostic method. This is not a clinical psychological diagnosis and should not be used for employment, credit, insurance, legal, medical or psychiatric decisions.",
    { bg: COLORS.surfaceAlt, textColor: COLORS.textBody },
  );
}

export interface PdfExportOptions {
  /** Include the rule weight × confidence × sufficiency × quality breakdown. Default true. */
  showCalculations?: boolean;
}

export function exportReportToPdf(
  report: AnalysisReport,
  previewDataUrl: string | null,
  options: PdfExportOptions = {},
): void {
  const showCalculations = options.showCalculations ?? true;
  const b = new PdfReportBuilder("Graphology Analysis Report");

  drawCover(b, report, previewDataUrl);
  b.reserveTocPage();

  drawExecutiveProfile(b, report);
  drawContradictions(b, report);
  drawScanQuality(b, report);
  drawCharacteristics(b, report);
  drawEvidenceAndRules(b, report, showCalculations);
  drawHandwritingPortions(b, report);
  drawLimitations(b, report);
  drawDisclaimer(b);

  b.finalize();
  b.save(`graphology-report-${report.sampleMetadata.filename.replace(/\.[^.]+$/, "")}.pdf`);
}
