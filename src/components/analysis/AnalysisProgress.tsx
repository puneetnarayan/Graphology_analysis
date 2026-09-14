"use client";

import { useWorkflow } from "@/state/workflowStore";
import { Card } from "@/components/ui/Card";

const STEP_ORDER = ["quality", "segmentation", "slant", "spacing", "zones", "letters", "rules", "report"];

export function AnalysisProgress() {
  const ctx = useWorkflow();
  return (
    <Card className="max-w-lg">
      <p className="text-sm font-semibold text-text-strong mb-3">Analyzing your sample…</p>
      <ul className="flex flex-col gap-2">
        {STEP_ORDER.map((step) => {
          const event = ctx.progressEvents.find((e) => e.step === step);
          const done = event?.done;
          const started = !!event;
          return (
            <li key={step} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  done ? "bg-success text-white" : started ? "bg-primary-soft text-primary-dark animate-pulse" : "bg-surface-sunken text-text-muted"
                }`}
              >
                {done ? "✓" : "…"}
              </span>
              <span className={done ? "text-text-strong" : "text-text-muted"}>{event?.label ?? step}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
