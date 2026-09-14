import { assessScanQuality } from "./quality/qualityEngine";
import { buildPipelineContext, extractAllFeatures } from "./features";
import { runRuleEngine } from "@/rules/engine";
import { ENGINE_VERSION, RULE_LIBRARY_VERSION } from "@/types";
import type { AnalysisReport } from "@/types";

export type AnalysisProgressStep =
  | "quality"
  | "segmentation"
  | "slant"
  | "spacing"
  | "zones"
  | "letters"
  | "rules"
  | "report";

export interface AnalysisProgressEvent {
  step: AnalysisProgressStep;
  label: string;
  done: boolean;
}

export interface RunAnalysisInput {
  imageData: ImageData;
  analyzeRegardlessOfQuality: boolean;
  sampleMetadata: AnalysisReport["sampleMetadata"];
  preprocessing: AnalysisReport["preprocessing"];
}

const STEP_LABELS: Record<AnalysisProgressStep, string> = {
  quality: "Assessing scan quality",
  segmentation: "Detecting writing lines",
  slant: "Measuring slant",
  spacing: "Analyzing spacing",
  zones: "Analyzing zones",
  letters: "Analyzing letter forms",
  rules: "Applying graphology rules",
  report: "Building report",
};

/**
 * Runs the full deterministic analysis pipeline (spec §10) on one image.
 * Emits progress events so the UI can render real-time step status without
 * freezing (spec §36); the actual computation happens inside a Web Worker
 * (see src/workers/analysisWorker.ts) so this function itself is pure/sync
 * and safe to call there.
 */
export function runAnalysisPipeline(
  input: RunAnalysisInput,
  onProgress?: (event: AnalysisProgressEvent) => void,
): AnalysisReport {
  const emit = (step: AnalysisProgressStep, done: boolean) =>
    onProgress?.({ step, label: STEP_LABELS[step], done });

  emit("quality", false);
  const scanQuality = assessScanQuality(input.imageData);
  emit("quality", true);

  emit("segmentation", false);
  const pipelineContext = buildPipelineContext(input.imageData, scanQuality, input.analyzeRegardlessOfQuality);
  emit("segmentation", true);

  emit("slant", false);
  emit("spacing", false);
  emit("zones", false);
  emit("letters", false);
  const { features, linesDetected, wordsDetected, lettersDetected } = extractAllFeatures(pipelineContext);
  emit("slant", true);
  emit("spacing", true);
  emit("zones", true);
  emit("letters", true);

  emit("rules", false);
  const { ruleActivations, evidence, contradictions, traitScores } = runRuleEngine(
    features,
    pipelineContext,
    scanQuality,
  );
  emit("rules", true);

  emit("report", false);
  const availableFeatureCount = Object.values(features).filter((f) => f.available).length;
  const totalFeatureCount = Object.values(features).length;
  const overallConfidence = Math.round(
    (scanQuality.overallScore * 0.4 +
      (traitScores.filter((t) => t.available).reduce((a, t) => a + t.confidence, 0) /
        Math.max(1, traitScores.filter((t) => t.available).length)) *
        0.4 +
      (availableFeatureCount / totalFeatureCount) * 100 * 0.2) /
      1,
  );

  const report: AnalysisReport = {
    engineVersion: ENGINE_VERSION,
    ruleLibraryVersion: RULE_LIBRARY_VERSION,
    generatedAt: new Date().toISOString(),
    sampleMetadata: input.sampleMetadata,
    preprocessing: input.preprocessing,
    scanQuality,
    analyzeRegardlessOfQuality: input.analyzeRegardlessOfQuality,
    features,
    ruleActivations,
    evidence,
    contradictions,
    traitScores,
    overallConfidence: Math.min(100, Math.max(0, overallConfidence)),
    linesDetected,
    wordsDetected,
    lettersDetected,
    userOverrideCount: 0,
  };
  emit("report", true);

  return report;
}
