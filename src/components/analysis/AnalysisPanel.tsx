"use client";

import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AnalysisProgress } from "./AnalysisProgress";
import { DashboardSummary } from "./DashboardSummary";
import { FeatureDetailCard } from "./FeatureDetailCard";
import { ANALYSIS_SUB_TABS } from "@/state/navigation";
import type { AllFeatureResults } from "@/types";

const UNIMPLEMENTED_NOTE: Record<string, string> = {
  connections: "Letter-connection style (garland/arcade/angular/thread) detection is not yet implemented in this release. It requires per-letter shape classification beyond this engine's current connected-component approach.",
  capitals: "Dedicated capital-letter analysis is not yet implemented in this release. Overall size and slant measurements still include capital letters.",
  punctuation: "Dedicated punctuation-mark analysis is not yet implemented in this release.",
};

export function AnalysisPanel() {
  const ctx = useWorkflow();

  if (ctx.isAnalyzing || (!ctx.analysisReport && ctx.progressEvents.length > 0)) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-text-strong">Analysis in Progress</h2>
        <AnalysisProgress />
      </div>
    );
  }

  if (!ctx.analysisReport) {
    return (
      <Card>
        <CardTitle>No analysis yet</CardTitle>
        <CardSubtitle>Accept the scan quality assessment to begin analysis.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("quality")}>
          Go to Scan Quality
        </Button>
      </Card>
    );
  }

  const report = ctx.analysisReport;
  const activeTab = ANALYSIS_SUB_TABS.find((t) => t.key === ctx.activeSubTab) ?? ANALYSIS_SUB_TABS[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Analysis</h2>
        <p className="text-sm text-text-muted mt-1">Measured handwriting characteristics, organized by category.</p>
      </div>

      <DashboardSummary report={report} isLiveUpdating={ctx.isLiveUpdating} />

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {ANALYSIS_SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => ctx.setActiveSubTab(tab.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab.key === activeTab.key ? "bg-primary text-white" : "bg-surface-alt text-text-muted hover:text-text-strong"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab.key === "overall" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.entries(report.features).map(([key, result]) => (
            <FeatureDetailCard key={key} featureKey={key} result={result} ruleActivations={report.ruleActivations} />
          ))}
        </div>
      )}

      {activeTab.key !== "overall" && activeTab.featureKey && (
        <FeatureDetailCard
          featureKey={activeTab.featureKey}
          result={report.features[activeTab.featureKey as keyof AllFeatureResults]}
          ruleActivations={report.ruleActivations}
        />
      )}

      {activeTab.key !== "overall" && !activeTab.featureKey && (
        <Card>
          <CardTitle>{activeTab.label}</CardTitle>
          <div className="mt-3 rounded-xl bg-surface-alt px-4 py-3 text-sm text-text-muted">
            {UNIMPLEMENTED_NOTE[activeTab.key] ?? "This feature detector is not yet implemented in this release."}
          </div>
        </Card>
      )}
    </div>
  );
}
