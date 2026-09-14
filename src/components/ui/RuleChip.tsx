"use client";

import { useWorkflow } from "@/state/workflowStore";

/**
 * A clickable rule-ID chip. Clicking it jumps to Evidence & Rules and
 * highlights every handwriting region tied to that rule (light grey
 * overlay on the scan) so the user can see exactly what was used.
 */
export function RuleChip({
  ruleId,
  tone = "neutral",
  className = "",
}: {
  ruleId: string;
  tone?: "neutral" | "success" | "danger";
  className?: string;
}) {
  const ctx = useWorkflow();
  const active = ctx.highlightedRuleId === ruleId;

  const toneClasses: Record<string, string> = {
    neutral: "bg-surface-sunken text-text-muted hover:bg-primary-soft hover:text-primary-dark",
    success: "bg-mint-soft text-[#2f6b52] hover:bg-primary-soft hover:text-primary-dark",
    danger: "bg-blush-soft text-[#8a3455] hover:bg-primary-soft hover:text-primary-dark",
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ctx.goToRuleEvidence(ruleId);
      }}
      title={`Highlight the handwriting used by ${ruleId}`}
      className={`font-mono text-[10px] rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
        active ? "bg-primary text-white" : toneClasses[tone]
      } ${className}`}
    >
      {ruleId}
    </button>
  );
}
