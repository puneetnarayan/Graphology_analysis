import type { AllFeatureResults, ImageRegion, RuleCategory, RuleEffect } from "@/types";
import type { PipelineContext } from "@/analysis/features/pipelineContext";

export interface RuleEvalContext {
  features: AllFeatureResults;
  pipeline: PipelineContext;
  imageQuality: number; // 0-1, overall scan quality composite
}

export interface RuleEvalMatch {
  /** 0-1 confidence in the underlying observation(s) this rule reads from */
  observationConfidence: number;
  /** count of underlying samples (strokes, words, lines...) supporting this activation */
  sampleCount: number;
  /** minimum sample count for a *partial* activation and the count considered "full" sufficiency */
  sufficiencyMin: number;
  sufficiencyFull: number;
  measurementLabel: string;
  regions: ImageRegion[];
  /** overrides the rule's static explanation when the phrasing depends on the measured value */
  explanationOverride?: string;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  description: string;
  explanation: string;
  limitations?: string;
  /** 0-1 base reliability weight of this rule within traditional graphology practice */
  ruleWeight: number;
  effects: RuleEffect[];
  /** Returns a match (with sample/confidence data) if the rule's condition holds, else null. */
  evaluate: (ctx: RuleEvalContext) => RuleEvalMatch | null;
}

export function defineRule(rule: Rule): Rule {
  return rule;
}
