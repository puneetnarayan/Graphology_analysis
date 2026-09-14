"use client";

import { useWorkflow } from "@/state/workflowStore";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { UploadPanel } from "@/components/upload/UploadPanel";
import { PreparationPanel } from "@/components/prep/PreparationPanel";
import { QualityPanel } from "@/components/quality/QualityPanel";
import { AnalysisPanel } from "@/components/analysis/AnalysisPanel";
import { OcrPanel } from "@/components/ocr/OcrPanel";
import { ProfilePanel } from "@/components/evidence/ProfilePanel";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { ReportPanel } from "@/components/report/ReportPanel";

export function AppShell() {
  const ctx = useWorkflow();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-24 md:pb-6">
          {ctx.error && (
            <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-[#8a3030]">
              {ctx.error}
            </div>
          )}
          <div className="mx-auto max-w-6xl">
            {ctx.activeSection === "upload" && <UploadPanel />}
            {ctx.activeSection === "prepare" && <PreparationPanel />}
            {ctx.activeSection === "quality" && <QualityPanel />}
            {ctx.activeSection === "analysis" && <AnalysisPanel />}
            {ctx.activeSection === "ocr" && <OcrPanel />}
            {ctx.activeSection === "profile" && <ProfilePanel />}
            {ctx.activeSection === "evidence" && <EvidencePanel />}
            {ctx.activeSection === "report" && <ReportPanel />}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
