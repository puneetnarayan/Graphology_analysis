"use client";

import { useWorkflow } from "@/state/workflowStore";

export function Header() {
  const ctx = useWorkflow();
  return (
    <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border-soft bg-surface/80 backdrop-blur-sm px-4 md:px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-sky text-white font-handwritten text-xl">
          G
        </div>
        <div>
          <h1 className="font-handwritten text-2xl leading-none text-text-strong">Graphology Analyzer</h1>
          <p className="text-[11px] text-text-muted leading-tight">Evidence-based handwriting analysis</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-3 py-1.5 text-xs font-medium text-[#2f6b52]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4a9e79]" />
          Processed locally &middot; nothing uploaded
        </span>
        <button
          onClick={ctx.reset}
          className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-dark transition-colors"
        >
          New Analysis
        </button>
      </div>
    </header>
  );
}
