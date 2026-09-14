import type { Contradiction, Evidence, RuleActivation, ScanQualityReport, TraitScore } from "./core";
import type { AllFeatureResults } from "./features";
import type { PreprocessingSettings, SampleMetadata } from "./sample";

export const ENGINE_VERSION = "1.0.0";
export const RULE_LIBRARY_VERSION = "1.0.0";

export interface AnalysisReport {
  engineVersion: string;
  ruleLibraryVersion: string;
  generatedAt: string;
  sampleMetadata: SampleMetadata;
  preprocessing: PreprocessingSettings;
  scanQuality: ScanQualityReport;
  analyzeRegardlessOfQuality: boolean;
  features: AllFeatureResults;
  ruleActivations: RuleActivation[];
  /** Total number of rules in the rule library that were eligible to fire (denominator for "N of M triggered"). */
  totalRuleCount: number;
  evidence: Evidence[];
  contradictions: Contradiction[];
  traitScores: TraitScore[];
  overallConfidence: number; // 0-100
  linesDetected: number;
  wordsDetected: number;
  lettersDetected: number;
  userOverrideCount: number;
}

/** Machine-readable export — deliberately excludes raw image pixel data (spec §35). */
export type AnalysisReportExport = AnalysisReport;
