"use client";

import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const TONES = ["primary", "mint", "sky", "peach", "blush", "butter"] as const;

function TraitBar({ score }: { score: number }) {
  const color = score >= 62 ? "var(--success)" : score <= 38 ? "var(--warning)" : "var(--sky)";
  return (
    <div className="h-2 w-full rounded-full bg-surface-sunken overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
    </div>
  );
}

export function ProfilePanel() {
  const ctx = useWorkflow();

  if (!ctx.analysisReport) {
    return (
      <Card>
        <CardTitle>No profile yet</CardTitle>
        <CardSubtitle>Complete analysis to see the personality profile.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("quality")}>
          Go to Scan Quality
        </Button>
      </Card>
    );
  }

  const report = ctx.analysisReport;
  const available = report.traitScores.filter((t) => t.available);
  const unavailableCount = report.traitScores.length - available.length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Personality Profile</h2>
        <p className="text-sm text-text-muted mt-1">
          A high-level profile based only on aggregated evidence from this sample. This is an interpretive
          graphological profile, not a clinical psychological assessment.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {available.map((trait, i) => (
          <Card key={trait.trait}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle>{trait.label}</CardTitle>
                <p className="text-2xl font-bold text-text-strong mt-1">{trait.score}</p>
              </div>
              <Badge tone={TONES[i % TONES.length]}>{trait.confidence}% confidence</Badge>
            </div>
            <div className="mt-3">
              <TraitBar score={trait.score} />
            </div>
            <p className="mt-3 text-sm text-text-body">{trait.synthesisText}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {trait.supportingRuleIds.map((id) => (
                <span key={id} className="font-mono text-[10px] rounded bg-mint-soft text-[#2f6b52] px-1.5 py-0.5">
                  ✓ {id}
                </span>
              ))}
              {trait.contradictingRuleIds.map((id) => (
                <span key={id} className="font-mono text-[10px] rounded bg-blush-soft text-[#8a3455] px-1.5 py-0.5">
                  △ {id}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {unavailableCount > 0 && (
        <Card className="bg-surface-alt border-transparent">
          <p className="text-xs text-text-muted">
            {unavailableCount} additional dimension{unavailableCount === 1 ? "" : "s"} could not be characterized
            from this sample due to insufficient evidence, and {unavailableCount === 1 ? "is" : "are"} not shown
            above.
          </p>
        </Card>
      )}

      {report.contradictions.length > 0 && (
        <Card>
          <CardTitle>Contradictions &amp; Nuances</CardTitle>
          <CardSubtitle>Competing indicators the synthesis reconciled rather than averaging away.</CardSubtitle>
          <div className="mt-3 flex flex-col gap-3">
            {report.contradictions.map((c) => (
              <div key={c.id} className="rounded-xl bg-blush-soft px-4 py-3 text-sm text-[#8a3455]">
                <p className="font-semibold">{c.description}</p>
                <p className="mt-1">{c.resolutionText}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
