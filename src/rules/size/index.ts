import { SIZE_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const sizeRules: Rule[] = [
  defineRule({
    id: "SIZE-LARGE-001",
    category: "size",
    description: "Large letter size",
    explanation: "Large middle-zone letters are traditionally read as a need for visibility, extroversion or expansiveness.",
    limitations: "Absolute size depends on scan scale; this rule uses relative pixel measurements without a physical scale reference.",
    ruleWeight: 0.5,
    effects: [
      { trait: "confidence_assertiveness", weight: 0.5, explanation: "Large size → visibility/assertiveness" },
      { trait: "energy_drive", weight: 0.3, explanation: "Large size → expansiveness" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.size;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.meanMiddleZoneHeightPx < SIZE_THRESHOLDS.LARGE_MIN_PX) return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 50,
        measurementLabel: `Mean middle-zone height ${s.measurement.meanMiddleZoneHeightPx}px`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SIZE-SMALL-001",
    category: "size",
    description: "Small letter size",
    explanation: "Small, compact letters are traditionally read as focus, precision and an inward attentional style.",
    limitations: "Absolute size depends on scan scale; this rule uses relative pixel measurements without a physical scale reference.",
    ruleWeight: 0.5,
    effects: [
      { trait: "attention_precision", weight: 0.5, explanation: "Small size → precision" },
      { trait: "self_control", weight: 0.3, explanation: "Small size → containment" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.size;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.meanMiddleZoneHeightPx > SIZE_THRESHOLDS.SMALL_MAX_PX) return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 50,
        measurementLabel: `Mean middle-zone height ${s.measurement.meanMiddleZoneHeightPx}px`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SIZE-VARIABLE-001",
    category: "size",
    description: "High size variability",
    explanation: "Notable inconsistency in letter size is traditionally read as adaptability or, in excess, difficulty maintaining focus.",
    ruleWeight: 0.4,
    effects: [
      { trait: "adaptability", weight: 0.3, explanation: "Size variability → flexibility" },
      { trait: "stress_pressure", weight: 0.3, explanation: "Size variability → inconsistency" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.size;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.variationCoefficient < SIZE_THRESHOLDS.HIGH_VARIATION_COEFFICIENT) return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 50,
        measurementLabel: `Size variation coefficient ${s.measurement.variationCoefficient}`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
];
