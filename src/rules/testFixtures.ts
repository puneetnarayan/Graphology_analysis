import type { AllFeatureResults, ScanQualityReport } from "@/types";
import type { PipelineContext } from "@/analysis/features/pipelineContext";

function unavailable(key: string, label: string) {
  return { key, label, reliability: "reliable" as const, available: false, unavailableReason: "test stub" };
}

export function baseFeatures(): AllFeatureResults {
  return {
    slant: unavailable("slant", "Slant"),
    baseline: unavailable("baseline", "Baseline"),
    size: unavailable("size", "Size"),
    spacing: unavailable("spacing", "Spacing"),
    margins: unavailable("margins", "Margins"),
    zones: unavailable("zones", "Zones"),
    pressure: unavailable("pressure", "Pressure Proxy"),
    tBars: unavailable("tBars", "T-Bars"),
    iDots: unavailable("iDots", "I-Dots"),
    ovals: unavailable("ovals", "Ovals"),
    legibility: unavailable("legibility", "Legibility"),
    rhythm: unavailable("rhythm", "Rhythm & Speed"),
    signature: unavailable("signature", "Signature"),
    letterShapes: unavailable("letterShapes", "Letter Shapes"),
  };
}

export function fullQualityReport(overallScore = 90): ScanQualityReport {
  return {
    overallScore,
    overallClass: "excellent",
    tiles: [],
    gridRows: 1,
    gridCols: 1,
    componentAverages: [],
    featureReadiness: [],
  };
}

export function stubPipelineContext(): PipelineContext {
  return {} as PipelineContext;
}
