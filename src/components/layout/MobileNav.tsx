"use client";

import { useWorkflow } from "@/state/workflowStore";
import { PRIMARY_SECTIONS, type PrimarySection } from "@/state/navigation";

function isSectionEnabled(section: PrimarySection, ctx: ReturnType<typeof useWorkflow>): boolean {
  switch (section) {
    case "upload":
    case "formations":
      return true;
    case "prepare":
    case "quality":
      return ctx.hasImage;
    case "analysis":
    case "ocr":
      return ctx.accepted;
    default:
      return !!ctx.analysisReport;
  }
}

export function MobileNav() {
  const ctx = useWorkflow();
  return (
    <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 z-20 flex overflow-x-auto border-t border-border-soft bg-surface/95 backdrop-blur-sm px-2 py-2 scrollbar-thin">
      {PRIMARY_SECTIONS.map((s) => {
        const enabled = isSectionEnabled(s.key, ctx);
        const active = ctx.activeSection === s.key;
        return (
          <button
            key={s.key}
            disabled={!enabled}
            onClick={() => ctx.setActiveSection(s.key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap ${
              active ? "bg-primary-soft text-primary-dark" : enabled ? "text-text-muted" : "text-text-muted/40"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
