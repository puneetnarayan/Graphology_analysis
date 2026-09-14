"use client";

import { useMemo, useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RuleChip } from "@/components/ui/RuleChip";
import type { ImageRegion } from "@/types";

export function EvidencePanel() {
  const ctx = useWorkflow();
  const [filter, setFilter] = useState<string>("all");

  const report = ctx.analysisReport;

  const categories = useMemo(
    () => (report ? Array.from(new Set(report.evidence.map((e) => e.featureKey))) : []),
    [report],
  );

  if (!report) {
    return (
      <Card>
        <CardTitle>No evidence yet</CardTitle>
        <CardSubtitle>Complete analysis to see the full evidence chain.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("quality")}>
          Go to Scan Quality
        </Button>
      </Card>
    );
  }

  const filteredEvidence = filter === "all" ? report.evidence : report.evidence.filter((e) => e.featureKey === filter);
  const highlighted = report.evidence.find((e) => e.id === ctx.highlightedRegionEvidenceId);
  const highlightedRuleEvidence = ctx.highlightedRuleId
    ? report.evidence.filter((e) => e.ruleId === ctx.highlightedRuleId)
    : [];

  let regionsToShow: ImageRegion[] = [];
  let visualCaption = "Click a table row or a rule to highlight its handwriting region.";
  if (ctx.highlightedRuleId) {
    regionsToShow = highlightedRuleEvidence.flatMap((e) => e.regions);
    visualCaption = `Highlighting all regions used by ${ctx.highlightedRuleId}`;
  } else if (highlighted) {
    regionsToShow = highlighted.regions;
    visualCaption = `Highlighting evidence ${highlighted.id}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Evidence &amp; Rules</h2>
        <p className="text-sm text-text-muted mt-1">
          Every conclusion is traceable: click an evidence row, a rule ID chip, or an entry in Rule Activations to see
          exactly which portion of the handwriting produced it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <Card padding="p-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-border-soft">
                  <th className="py-2 px-2 font-medium">ID</th>
                  <th className="py-2 px-2 font-medium">Feature</th>
                  <th className="py-2 px-2 font-medium">Measurement</th>
                  <th className="py-2 px-2 font-medium text-right">Confidence</th>
                  <th className="py-2 px-2 font-medium">Rule</th>
                  <th className="py-2 px-2 font-medium text-right">Contribution</th>
                  <th className="py-2 px-2 font-medium">Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvidence.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => ctx.setHighlightedEvidence(e.id === ctx.highlightedRegionEvidenceId ? null : e.id)}
                    className={`cursor-pointer border-b border-border-soft/60 last:border-0 hover:bg-primary-softer ${
                      e.id === ctx.highlightedRegionEvidenceId ? "bg-primary-soft" : ""
                    }`}
                  >
                    <td className="py-2 px-2 font-mono font-semibold text-primary-dark">{e.id}</td>
                    <td className="py-2 px-2 capitalize">{e.featureKey}</td>
                    <td className="py-2 px-2 text-text-body">{e.measurement}</td>
                    <td className="py-2 px-2 text-right">{Math.round(e.confidence * 100)}%</td>
                    <td className="py-2 px-2">
                      <RuleChip ruleId={e.ruleId} />
                    </td>
                    <td className="py-2 px-2 text-right">{e.ruleContribution.toFixed(2)}</td>
                    <td className="py-2 px-2 text-text-muted max-w-[220px] truncate" title={e.interpretation}>
                      {e.interpretation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Filter by Feature</CardTitle>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-full px-2.5 py-1 text-xs ${filter === "all" ? "bg-primary text-white" : "bg-surface-alt text-text-muted"}`}
              >
                All ({report.evidence.length})
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`rounded-full px-2.5 py-1 text-xs capitalize ${filter === c ? "bg-primary text-white" : "bg-surface-alt text-text-muted"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Visual Evidence</CardTitle>
            <CardSubtitle>{visualCaption}</CardSubtitle>
            <div className="relative mt-3">
              {ctx.previewDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ctx.previewDataUrl} alt="" className="w-full rounded-lg border border-border-soft" />
              )}
              {regionsToShow.map((r, i) => (
                <div
                  key={i}
                  className="absolute border-2 border-gray-400 bg-gray-400/30 rounded-sm pointer-events-none"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                  }}
                />
              ))}
            </div>
            {highlighted && !ctx.highlightedRuleId && (
              <div className="mt-3 text-xs">
                <Badge tone="primary">{highlighted.ruleId}</Badge>
                <p className="mt-2 text-text-body">{highlighted.interpretation}</p>
              </div>
            )}
            {ctx.highlightedRuleId && highlightedRuleEvidence.length > 0 && (
              <div className="mt-3 text-xs flex flex-col gap-1.5">
                <Badge tone="primary">
                  {ctx.highlightedRuleId} &middot; {regionsToShow.length} region{regionsToShow.length === 1 ? "" : "s"}
                </Badge>
                {highlightedRuleEvidence.map((e) => (
                  <p key={e.id} className="text-text-body">
                    {e.id}: {e.interpretation}
                  </p>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle>Rule Activations ({report.ruleActivations.length})</CardTitle>
        <div className="mt-3 flex flex-col gap-2 max-h-96 overflow-y-auto scrollbar-thin">
          {report.ruleActivations.map((r) => (
            <button
              key={r.ruleId}
              onClick={() => ctx.setHighlightedRule(ctx.highlightedRuleId === r.ruleId ? null : r.ruleId)}
              className={`text-left rounded-xl px-4 py-3 text-xs transition-colors ${
                ctx.highlightedRuleId === r.ruleId ? "bg-primary-soft" : "bg-surface-alt hover:bg-primary-softer"
              }`}
            >
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-mono font-semibold text-primary-dark">{r.ruleId}</span>
                <span className="text-text-muted">
                  weight {r.ruleWeight.toFixed(2)} × conf {(r.observationConfidence * 100).toFixed(0)}% × sufficiency{" "}
                  {(r.sampleSufficiency * 100).toFixed(0)}% × quality {(r.imageQuality * 100).toFixed(0)}% ={" "}
                  <strong>{r.effectiveWeight.toFixed(2)}</strong>
                </span>
              </div>
              <p className="mt-1 text-text-body">{r.description}</p>
              <p className="mt-1 text-text-muted">{r.explanation}</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
