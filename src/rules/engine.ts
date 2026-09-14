import { CONFIDENCE_THRESHOLDS, SAMPLE_SUFFICIENCY } from "@/config/thresholds";
import { TRAIT_DEFINITIONS, traitLabel } from "@/config/traits";
import { evidenceId } from "@/utils/id";
import { clamp } from "@/utils/stats";
import type {
  AllFeatureResults,
  Contradiction,
  Evidence,
  RuleActivation,
  ScanQualityReport,
  TraitKey,
  TraitScore,
} from "@/types";
import type { PipelineContext } from "@/analysis/features/pipelineContext";
import { slantRules } from "./slant";
import { pressureRules } from "./pressure";
import { baselineRules } from "./baseline";
import { sizeRules } from "./size";
import { spacingRules } from "./spacing";
import { marginRules } from "./margins";
import { zoneRules } from "./zones";
import { letterRules } from "./letters";
import { rhythmRules } from "./rhythm";
import { signatureRules } from "./signature";
import type { Rule, RuleEvalContext } from "./schema";

export const ALL_RULES: Rule[] = [
  ...slantRules,
  ...pressureRules,
  ...baselineRules,
  ...sizeRules,
  ...spacingRules,
  ...marginRules,
  ...zoneRules,
  ...letterRules,
  ...rhythmRules,
  ...signatureRules,
];

export const TOTAL_RULE_COUNT = ALL_RULES.length;

export interface RuleEngineOutput {
  ruleActivations: RuleActivation[];
  evidence: Evidence[];
  contradictions: Contradiction[];
  traitScores: TraitScore[];
}

export function runRuleEngine(
  features: AllFeatureResults,
  pipeline: PipelineContext,
  scanQuality: ScanQualityReport,
): RuleEngineOutput {
  const imageQuality = clamp(scanQuality.overallScore / 100, 0.1, 1);
  const evalCtx: RuleEvalContext = { features, pipeline, imageQuality };

  const ruleActivations: RuleActivation[] = [];
  const evidence: Evidence[] = [];
  let evidenceCounter = 0;

  for (const rule of ALL_RULES) {
    const match = rule.evaluate(evalCtx);
    if (!match) continue;
    if (match.observationConfidence < CONFIDENCE_THRESHOLDS.MIN_RULE_ACTIVATION_CONFIDENCE) continue;

    const sampleSufficiency = SAMPLE_SUFFICIENCY.scale(match.sampleCount, match.sufficiencyMin, match.sufficiencyFull);
    const effectiveWeight = rule.ruleWeight * match.observationConfidence * sampleSufficiency * imageQuality;
    if (effectiveWeight < CONFIDENCE_THRESHOLDS.MIN_EFFECTIVE_WEIGHT) continue;

    // One evidence entry per underlying region rather than one entry bundling
    // every region: this makes each specific piece of handwriting (a single
    // word, a single t-bar crossing...) independently traceable and
    // clickable, instead of collapsing an entire rule's evidence into one
    // undifferentiated row.
    const interpretation = rule.effects.map((e) => e.explanation).join("; ");
    const evidenceIds: string[] = [];
    const regionsForEvidence = match.regions.length > 0 ? match.regions : [undefined];
    const multiple = regionsForEvidence.length > 1;
    regionsForEvidence.forEach((region, index) => {
      evidenceCounter += 1;
      const evId = evidenceId(evidenceCounter);
      evidenceIds.push(evId);
      const sampleLabel = region?.label ? ` — ${region.label}` : "";
      evidence.push({
        id: evId,
        featureKey: rule.category,
        label: rule.description,
        measurement: multiple
          ? `${match.measurementLabel} (sample ${index + 1}/${regionsForEvidence.length}${sampleLabel})`
          : match.measurementLabel,
        confidence: match.observationConfidence,
        regions: region ? [region] : [],
        ruleId: rule.id,
        ruleContribution: Number(effectiveWeight.toFixed(3)),
        interpretation,
      });
    });

    ruleActivations.push({
      ruleId: rule.id,
      category: rule.category,
      description: rule.description,
      explanation: match.explanationOverride ?? rule.explanation,
      limitations: rule.limitations,
      effects: rule.effects,
      observationConfidence: match.observationConfidence,
      ruleWeight: rule.ruleWeight,
      sampleSufficiency,
      imageQuality,
      effectiveWeight,
      evidenceIds,
    });
  }

  const { traitScores, contradictions } = synthesizeTraits(ruleActivations);

  return { ruleActivations, evidence, contradictions, traitScores };
}

function synthesizeTraits(activations: RuleActivation[]): {
  traitScores: TraitScore[];
  contradictions: Contradiction[];
} {
  const traitScores: TraitScore[] = [];
  const contradictions: Contradiction[] = [];
  let contradictionCounter = 0;

  for (const def of TRAIT_DEFINITIONS) {
    const contributing = activations
      .map((a) => ({ activation: a, effect: a.effects.find((e) => e.trait === def.key) }))
      .filter((c): c is { activation: RuleActivation; effect: NonNullable<typeof c.effect> } => !!c.effect);

    if (contributing.length === 0) continue;

    const positive = contributing.filter((c) => c.effect.weight > 0);
    const negative = contributing.filter((c) => c.effect.weight < 0);

    const totalEffectiveWeight = contributing.reduce((a, c) => a + c.activation.effectiveWeight, 0);
    if (totalEffectiveWeight < CONFIDENCE_THRESHOLDS.MIN_EFFECTIVE_WEIGHT) {
      traitScores.push({
        trait: def.key,
        label: def.label,
        score: 50,
        confidence: 0,
        supportingRuleIds: [],
        contradictingRuleIds: [],
        available: false,
        insufficientEvidenceReason: "Insufficient corroborating evidence for this dimension in this sample.",
        synthesisText: "Insufficient evidence to characterize this dimension in this sample.",
      });
      continue;
    }

    const weightedSum = contributing.reduce((a, c) => a + c.effect.weight * c.activation.effectiveWeight, 0);
    const score = clamp(50 + weightedSum * 55, 0, 100);
    const avgConfidence = clamp(
      (contributing.reduce((a, c) => a + c.activation.observationConfidence * c.activation.effectiveWeight, 0) /
        totalEffectiveWeight) *
        100,
      0,
      99,
    );

    const positiveWeight = positive.reduce((a, c) => a + c.activation.effectiveWeight, 0);
    const negativeWeight = negative.reduce((a, c) => a + c.activation.effectiveWeight, 0);
    const hasContradiction =
      positive.length > 0 &&
      negative.length > 0 &&
      Math.min(positiveWeight, negativeWeight) >= CONFIDENCE_THRESHOLDS.MIN_EFFECTIVE_WEIGHT;

    let contradictionNote = "";
    if (hasContradiction) {
      contradictionCounter += 1;
      const dominant = positiveWeight >= negativeWeight ? "supporting" : "opposing";
      const cId = `C${contradictionCounter.toString().padStart(3, "0")}`;
      const resolutionText = `The sample shows indicators pointing toward both higher and lower ${def.label.toLowerCase()}. The combination suggests a context-dependent rather than uniform expression of this dimension, with ${dominant === "supporting" ? "the stronger indicators favoring " + def.highText : "the stronger indicators favoring " + def.lowText}.`;
      contradictions.push({
        id: cId,
        trait: def.key,
        description: `Competing indicators for ${def.label}`,
        supportingRuleIds: positive.map((c) => c.activation.ruleId),
        opposingRuleIds: negative.map((c) => c.activation.ruleId),
        resolutionText,
      });
      contradictionNote = ` ${resolutionText}`;
    }

    const band = score >= 62 ? "high" : score <= 38 ? "low" : "mid";
    const descriptor = band === "high" ? def.highText : band === "low" ? def.lowText : def.midText;
    const capitalizedDescriptor = descriptor.charAt(0).toUpperCase() + descriptor.slice(1);
    const synthesisText = `${capitalizedDescriptor}.${contradictionNote}`;

    traitScores.push({
      trait: def.key,
      label: def.label,
      score: Math.round(score),
      confidence: Math.round(avgConfidence),
      supportingRuleIds: positive.map((c) => c.activation.ruleId),
      contradictingRuleIds: negative.map((c) => c.activation.ruleId),
      available: true,
      synthesisText,
    });
  }

  return { traitScores, contradictions };
}

export function traitLabelFor(key: TraitKey): string {
  return traitLabel(key);
}
