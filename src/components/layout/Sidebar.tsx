"use client";

import { useEffect, useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { PRIMARY_SECTIONS, type PrimarySection } from "@/state/navigation";

const COLLAPSE_STORAGE_KEY = "graphology_sidebar_collapsed";

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
    case "ocr":
      return ctx.accepted;
    case "profile":
    case "evidence":
    case "report":
      return !!ctx.analysisReport;
    case "formations":
    case "bookPdf":
      return true;
    default:
      return false;
  }
}

const ICONS: Record<PrimarySection, string> = {
  upload: "↑",
  prepare: "⚙",
  quality: "✓",
  analysis: "▦",
  ocr: "🔤",
  profile: "◉",
  evidence: "⊕",
  report: "≣",
  formations: "📚",
  bookPdf: "📖",
};

export function Sidebar() {
  const ctx = useWorkflow();
  // Defaults to expanded (matching SSR, which has no localStorage) and is
  // corrected right after mount if the user had collapsed it before — doing
  // this in the initializer instead would read localStorage during the
  // pre-hydration client render and mismatch the server-rendered markup.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage post-hydration is the point
      if (stored) setCollapsed(true);
    } catch {
      // Ignore — default expanded.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal — preference just won't persist.
      }
      return next;
    });
  }

  return (
    <aside
      className={`no-print shrink-0 border-r border-border-soft bg-surface/60 backdrop-blur-sm py-5 hidden md:flex md:flex-col gap-1 transition-[width] ${
        collapsed ? "w-16 px-2" : "w-60 px-3"
      }`}
    >
      <div className={`flex items-center pb-4 ${collapsed ? "justify-center px-0" : "justify-between px-3"}`}>
        {!collapsed && <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Workflow</p>}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted hover:text-text-strong hover:bg-surface-alt"
        >
          ☰
        </button>
      </div>
      {PRIMARY_SECTIONS.map((s) => {
        const enabled = isSectionEnabled(s.key, ctx);
        const active = ctx.activeSection === s.key;
        return (
          <button
            key={s.key}
            disabled={!enabled}
            onClick={() => ctx.setActiveSection(s.key)}
            title={collapsed ? s.label : undefined}
            className={`group flex items-center gap-3 rounded-xl py-2.5 text-left text-sm font-medium transition-colors ${
              collapsed ? "justify-center px-0" : "px-3"
            } ${
              active
                ? "bg-primary-soft text-primary-dark"
                : enabled
                  ? "text-text-body hover:bg-surface-alt"
                  : "text-text-muted/50 cursor-not-allowed"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs ${
                active ? "bg-primary text-white" : "bg-surface-sunken text-text-muted"
              }`}
            >
              {ICONS[s.key]}
            </span>
            {!collapsed && s.label}
          </button>
        );
      })}

      <div className={`mt-auto pt-4 ${collapsed ? "px-0" : "px-3"}`}>
        <button
          onClick={ctx.reset}
          title={collapsed ? "New Analysis" : undefined}
          className={`w-full rounded-xl border border-border-soft bg-surface py-2 text-xs font-semibold text-text-muted hover:text-text-strong hover:bg-surface-alt transition-colors ${
            collapsed ? "px-0" : "px-3"
          }`}
        >
          {collapsed ? "+" : "+ New Analysis"}
        </button>
      </div>
    </aside>
  );
}
