"use client";

import { useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReadabilityBadge } from "@/components/ui/Badge";
import { LiveUpdateBadge } from "@/components/ui/LiveUpdateBadge";
import { buildTextReport } from "@/report/textReport";
import { exportReportToPdf } from "@/report/pdfExport";

export function ReportPanel() {
  const ctx = useWorkflow();
  const [copied, setCopied] = useState(false);
  const [showCalculations, setShowCalculations] = useState(true);

  if (!ctx.analysisReport) {
    return (
      <Card>
        <CardTitle>No report yet</CardTitle>
        <CardSubtitle>Complete analysis to generate the report.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("quality")}>
          Go to Scan Quality
        </Button>
      </Card>
    );
  }

  const report = ctx.analysisReport;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildTextReport(report, { showCalculations }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graphology-analysis-${report.sampleMetadata.filename.replace(/\.[^.]+$/, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-text-strong">Report</h2>
            {ctx.isLiveUpdating && <LiveUpdateBadge />}
          </div>
          <p className="text-sm text-text-muted mt-1">Full evidence-based graphology analysis report.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showCalculations}
              onChange={(e) => setShowCalculations(e.target.checked)}
            />
            Show calculations
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="outline" onClick={() => exportReportToPdf(report, ctx.previewDataUrl, { showCalculations })}>
              Export PDF
            </Button>
            <Button variant="outline" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy Report"}
            </Button>
            <Button variant="outline" onClick={handleJson}>
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-handwritten text-3xl text-text-strong">Analysis Summary</h3>
            <p className="text-xs text-text-muted mt-1">
              Generated {new Date(report.generatedAt).toLocaleString()} &middot; Engine v{report.engineVersion} &middot;
              Rules v{report.ruleLibraryVersion}
            </p>
          </div>
          <ReadabilityBadge classification={report.scanQuality.overallClass} />
        </div>
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <dt className="text-xs text-text-muted">Scan Readability</dt>
            <dd className="font-semibold text-text-strong">{report.scanQuality.overallScore}%</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Analysis Confidence</dt>
            <dd className="font-semibold text-text-strong">{report.overallConfidence}%</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">Lines / Words / Components</dt>
            <dd className="font-semibold text-text-strong">
              {report.linesDetected} / {report.wordsDetected} / {report.lettersDetected}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">User Overrides</dt>
            <dd className="font-semibold text-text-strong">{report.userOverrideCount}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle>Executive Profile</CardTitle>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {report.traitScores
            .filter((t) => t.available)
            .map((t) => (
              <div key={t.trait} className="rounded-xl bg-surface-alt px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-strong">{t.label}</p>
                  <p className="text-sm font-bold text-primary-dark">{t.score}</p>
                </div>
                <p className="text-xs text-text-muted mt-1">{t.synthesisText}</p>
              </div>
            ))}
        </div>
      </Card>

      {report.contradictions.length > 0 && (
        <Card>
          <CardTitle>Contradictions &amp; Nuances</CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {report.contradictions.map((c) => (
              <p key={c.id} className="text-sm text-text-body rounded-xl bg-blush-soft px-4 py-3 text-[#8a3455]">
                {c.resolutionText}
              </p>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>Observed Handwriting Characteristics</CardTitle>
        <div className="mt-3 flex flex-col divide-y divide-border-soft">
          {Object.values(report.features).map((f) => (
            <div key={f.key} className="py-2.5 flex justify-between gap-3 text-sm">
              <span className="font-medium text-text-strong">{f.label}</span>
              <span className={`text-xs text-right ${f.available ? "text-text-muted" : "text-warning"}`}>
                {f.available ? "Measured" : `Insufficient evidence`}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>Rule Activations ({report.ruleActivations.length})</CardTitle>
        <CardSubtitle>Every graphology rule that fired, and the weighting behind its contribution.</CardSubtitle>
        <div className="mt-3 flex flex-col gap-2">
          {report.ruleActivations.map((r) => (
            <div key={r.ruleId} className="rounded-xl bg-surface-alt px-4 py-3 text-xs">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-mono font-semibold text-primary-dark">{r.ruleId}</span>
                {showCalculations ? (
                  <span className="text-text-muted">
                    weight {r.ruleWeight.toFixed(2)} × conf {(r.observationConfidence * 100).toFixed(0)}% ×
                    sufficiency {(r.sampleSufficiency * 100).toFixed(0)}% × quality {(r.imageQuality * 100).toFixed(0)}%
                    = <strong>{r.effectiveWeight.toFixed(2)}</strong>
                  </span>
                ) : (
                  <span className="text-text-muted">
                    Contribution: <strong>{r.effectiveWeight.toFixed(2)}</strong>
                  </span>
                )}
              </div>
              <p className="mt-1 text-text-body">{r.description}</p>
              <p className="mt-1 text-text-muted">{r.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="p-3">
        <div className="px-2 pt-2">
          <CardTitle>Handwriting Portions Used (Evidence Table)</CardTitle>
          <CardSubtitle>Full traceability from conclusion to measurement to handwriting region.</CardSubtitle>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-soft">
                <th className="py-2 px-2">Evidence ID</th>
                <th className="py-2 px-2">Feature</th>
                <th className="py-2 px-2">Measurement</th>
                <th className="py-2 px-2 text-right">Confidence</th>
                <th className="py-2 px-2">Rule ID</th>
                <th className="py-2 px-2 text-right">Contribution</th>
                <th className="py-2 px-2">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {report.evidence.map((e) => (
                <tr key={e.id} className="border-b border-border-soft/60 last:border-0">
                  <td className="py-1.5 px-2 font-mono font-semibold text-primary-dark">{e.id}</td>
                  <td className="py-1.5 px-2 capitalize">{e.featureKey}</td>
                  <td className="py-1.5 px-2">{e.measurement}</td>
                  <td className="py-1.5 px-2 text-right">{Math.round(e.confidence * 100)}%</td>
                  <td className="py-1.5 px-2 font-mono">{e.ruleId}</td>
                  <td className="py-1.5 px-2 text-right">{e.ruleContribution.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-text-muted">{e.interpretation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle>Limitations</CardTitle>
        <ul className="mt-3 list-disc pl-5 text-sm text-text-body space-y-1.5">
          <li>Scan quality varies by region; low-confidence regions reduce confidence rather than being silently discarded.</li>
          <li>Pressure is an image-derived proxy, not a physical pen-pressure measurement.</li>
          <li>Automated letter, signature and connection-style identification is heuristic and may be uncertain; use manual overrides where available.</li>
          <li>Letter-connection, capital-letter and punctuation-specific detectors are not yet implemented in this release.</li>
          {report.userOverrideCount > 0 && <li>{report.userOverrideCount} observation(s) were manually overridden by the user.</li>}
        </ul>
      </Card>

      <Card className="bg-surface-alt border-transparent">
        <CardTitle>Disclaimer</CardTitle>
        <p className="mt-2 text-sm text-text-muted">
          This report presents graphological interpretations based on traditional graphology literature and a
          deterministic rule engine. Graphology&apos;s ability to infer personality has not been established as a
          reliable clinical psychological diagnostic method. This is not a clinical psychological diagnosis and
          should not be used for employment, credit, insurance, legal, medical or psychiatric decisions.
        </p>
      </Card>
    </div>
  );
}
