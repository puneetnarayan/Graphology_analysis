import { Card } from "@/components/ui/Card";
import { LiveUpdateBadge } from "@/components/ui/LiveUpdateBadge";
import type { AnalysisReport } from "@/types";

function StatTile({ label, value, tone }: { label: string; value: string; tone: "primary" | "mint" | "sky" | "peach" }) {
  const bg = { primary: "bg-primary-soft", mint: "bg-mint-soft", sky: "bg-sky-soft", peach: "bg-peach-soft" }[tone];
  return (
    <div className={`rounded-xl ${bg} px-4 py-3`}>
      <p className="text-2xl font-bold text-text-strong">{value}</p>
      <p className="text-xs text-text-muted mt-0.5">{label}</p>
    </div>
  );
}

export function DashboardSummary({ report, isLiveUpdating }: { report: AnalysisReport; isLiveUpdating?: boolean }) {
  const totalFeatures = Object.values(report.features).length;
  const availableFeatures = Object.values(report.features).filter((f) => f.available).length;
  const regionCount = report.evidence.reduce((a, e) => a + e.regions.length, 0);

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-strong">Analysis Complete</h3>
          {isLiveUpdating && <LiveUpdateBadge />}
        </div>
        <span className="text-xs text-text-muted">
          Engine v{report.engineVersion} &middot; Rules v{report.ruleLibraryVersion}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Scan Readability" value={`${report.scanQuality.overallScore}%`} tone="sky" />
        <StatTile label="Analysis Confidence" value={`${report.overallConfidence}%`} tone="primary" />
        <StatTile label="Rules Triggered" value={`${report.ruleActivations.length} / ${report.totalRuleCount}`} tone="peach" />
        <StatTile label="Features Analyzed" value={`${availableFeatures} / ${totalFeatures}`} tone="mint" />
        <StatTile label="Evidence Entries" value={String(report.evidence.length)} tone="peach" />
        <StatTile label="Regions Highlighted" value={String(regionCount)} tone="mint" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-text-muted">
        <div>
          <p className="text-lg font-semibold text-text-strong">{report.linesDetected}</p>
          Lines detected
        </div>
        <div>
          <p className="text-lg font-semibold text-text-strong">{report.wordsDetected}</p>
          Words detected
        </div>
        <div>
          <p className="text-lg font-semibold text-text-strong">{report.lettersDetected}</p>
          Components detected
        </div>
      </div>
    </Card>
  );
}
