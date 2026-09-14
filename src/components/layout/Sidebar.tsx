"use client";

import { useWorkflow } from "@/state/workflowStore";
import { PRIMARY_SECTIONS, type PrimarySection } from "@/state/navigation";

function isSectionEnabled(section: PrimarySection, ctx: ReturnType<typeof useWorkflow>): boolean {
  switch (section) {
    case "upload":
      return true;
    case "prepare":
      return ctx.hasImage;
    case "quality":
      return ctx.hasImage;
    case "analysis":
      return ctx.accepted;
    case "profile":
    case "evidence":
    case "report":
      return !!ctx.analysisReport;
    default:
      return false;
  }
}

const ICONS: Record<PrimarySection, string> = {
  upload: "↑",
  prepare: "⚙",
  quality: "✓",
  analysis: "▦",
  profile: "◉",
  evidence: "⊕",
  report: "≣",
};

export function Sidebar() {
  const ctx = useWorkflow();

  return (
    <aside className="no-print w-60 shrink-0 border-r border-border-soft bg-surface/60 backdrop-blur-sm px-3 py-5 hidden md:flex md:flex-col gap-1">
      <div className="px-3 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Workflow</p>
      </div>
      {PRIMARY_SECTIONS.map((s) => {
        const enabled = isSectionEnabled(s.key, ctx);
        const active = ctx.activeSection === s.key;
        return (
          <button
            key={s.key}
            disabled={!enabled}
            onClick={() => ctx.setActiveSection(s.key)}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              active
                ? "bg-primary-soft text-primary-dark"
                : enabled
                  ? "text-text-body hover:bg-surface-alt"
                  : "text-text-muted/50 cursor-not-allowed"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs ${
                active ? "bg-primary text-white" : "bg-surface-sunken text-text-muted"
              }`}
            >
              {ICONS[s.key]}
            </span>
            {s.label}
          </button>
        );
      })}

      <div className="mt-auto px-3 pt-4">
        <button
          onClick={ctx.reset}
          className="w-full rounded-xl border border-border-soft bg-surface px-3 py-2 text-xs font-semibold text-text-muted hover:text-text-strong hover:bg-surface-alt transition-colors"
        >
          + New Analysis
        </button>
      </div>
    </aside>
  );
}
