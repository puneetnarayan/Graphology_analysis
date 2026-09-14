import type { AnalysisReport } from "@/types";

export function buildTextReport(report: AnalysisReport): string {
  const lines: string[] = [];
  const add = (s = "") => lines.push(s);

  add("GRAPHOLOGY ANALYSIS REPORT");
  add(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
  add(`Engine v${report.engineVersion} · Rule Library v${report.ruleLibraryVersion}`);
  add("");
  add("--- SUMMARY ---");
  add(`Sample: ${report.sampleMetadata.filename} (${report.sampleMetadata.width}x${report.sampleMetadata.height})`);
  add(`Scan readability: ${report.scanQuality.overallScore}% (${report.scanQuality.overallClass})`);
  add(`Overall analysis confidence: ${report.overallConfidence}%`);
  add(`Lines detected: ${report.linesDetected}  Words: ${report.wordsDetected}  Components: ${report.lettersDetected}`);
  add(`Analyze regardless of scan quality: ${report.analyzeRegardlessOfQuality ? "Yes" : "No"}`);
  add("");

  add("--- PERSONALITY PROFILE ---");
  for (const t of report.traitScores.filter((t) => t.available)) {
    add(`${t.label}: ${t.score}/100 (confidence ${t.confidence}%)`);
    add(`  ${t.synthesisText}`);
  }
  add("");

  if (report.contradictions.length) {
    add("--- CONTRADICTIONS & NUANCES ---");
    for (const c of report.contradictions) {
      add(`${c.description}: ${c.resolutionText}`);
    }
    add("");
  }

  add("--- OBSERVED HANDWRITING CHARACTERISTICS ---");
  for (const f of Object.values(report.features)) {
    add(`${f.label}: ${f.available ? "Available" : `Unavailable — ${f.unavailableReason}`}`);
    if (f.available && f.measurement && typeof f.measurement === "object" && !Array.isArray(f.measurement)) {
      for (const [mk, mv] of Object.entries(f.measurement as Record<string, unknown>)) {
        add(`    ${mk}: ${String(mv)}`);
      }
    }
  }
  add("");

  add("--- EVIDENCE & RULES ---");
  add("Evidence ID | Feature | Measurement | Confidence | Rule ID | Contribution | Interpretation");
  for (const e of report.evidence) {
    add(
      `${e.id} | ${e.featureKey} | ${e.measurement} | ${(e.confidence * 100).toFixed(0)}% | ${e.ruleId} | ${e.ruleContribution.toFixed(2)} | ${e.interpretation}`,
    );
  }
  add("");

  add("--- LIMITATIONS ---");
  add("- Scan quality varies by region; low-confidence regions are flagged rather than silently discarded.");
  add("- Pressure is an image-derived proxy, not a physical pressure measurement.");
  add("- Automated letter/signature identification may be uncertain; user overrides are tracked separately.");
  add(`- User overrides applied: ${report.userOverrideCount}`);
  add("");

  add("--- DISCLAIMER ---");
  add(
    "This report presents graphological interpretations based on traditional graphology literature and a deterministic rule engine. It is not a clinical psychological diagnosis and has not been scientifically validated as a personality assessment method. It should not be used for employment, credit, insurance, legal, medical or psychiatric decisions.",
  );

  return lines.join("\n");
}
