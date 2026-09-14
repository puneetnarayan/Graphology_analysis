import { LEGIBILITY_THRESHOLDS, RHYTHM_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const rhythmRules: Rule[] = [
  defineRule({
    id: "LEGIBILITY-HIGH-001",
    category: "legibility",
    description: "High legibility",
    explanation: "Highly legible writing is traditionally read as a communication style oriented toward clarity for the reader.",
    ruleWeight: 0.5,
    effects: [{ trait: "communication_style", weight: 0.6, explanation: "High legibility → clarity-focused" }],
    evaluate: (ctx) => {
      const l = ctx.features.legibility;
      if (!l.available || !l.measurement) return null;
      if (l.measurement.score < LEGIBILITY_THRESHOLDS.HIGH_MIN) return null;
      return {
        observationConfidence: l.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Legibility score ${l.measurement.score}/100`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "LEGIBILITY-LOW-001",
    category: "legibility",
    description: "Low legibility",
    explanation: "Difficult-to-read writing is traditionally read as writing primarily for oneself, or idiosyncratic self-expression.",
    ruleWeight: 0.4,
    effects: [
      { trait: "communication_style", weight: -0.4, explanation: "Low legibility → self-oriented writing" },
      { trait: "imagination_creativity", weight: 0.2, explanation: "Low legibility → idiosyncrasy" },
    ],
    evaluate: (ctx) => {
      const l = ctx.features.legibility;
      if (!l.available || !l.measurement) return null;
      if (l.measurement.score > LEGIBILITY_THRESHOLDS.LOW_MAX) return null;
      return {
        observationConfidence: l.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Legibility score ${l.measurement.score}/100`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "RHYTHM-STEADY-001",
    category: "rhythm",
    description: "Steady writing rhythm",
    explanation: "Low variability in stroke, size and spacing is traditionally read as sustained self-regulation.",
    ruleWeight: 0.4,
    effects: [
      { trait: "self_control", weight: 0.4, explanation: "Steady rhythm → regulation" },
      { trait: "organization", weight: 0.3, explanation: "Steady rhythm → consistency" },
    ],
    evaluate: (ctx) => {
      const r = ctx.features.rhythm;
      if (!r.available || !r.measurement) return null;
      const combinedVariability = (r.measurement.sizeVariability + r.measurement.spacingVariability) / 2;
      if (combinedVariability > 1 - RHYTHM_THRESHOLDS.HIGH_VARIABILITY) return null;
      return {
        observationConfidence: r.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Combined size/spacing variability ${combinedVariability.toFixed(2)}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "RHYTHM-VARIABLE-001",
    category: "rhythm",
    description: "Variable writing rhythm",
    explanation: "Notable variability in stroke, size and spacing is traditionally read as flexibility or fluctuating focus.",
    ruleWeight: 0.4,
    effects: [
      { trait: "flexibility", weight: 0.4, explanation: "Variable rhythm → adaptability" },
      { trait: "stress_pressure", weight: 0.25, explanation: "Variable rhythm → inconsistency" },
    ],
    evaluate: (ctx) => {
      const r = ctx.features.rhythm;
      if (!r.available || !r.measurement) return null;
      const combinedVariability = (r.measurement.sizeVariability + r.measurement.spacingVariability) / 2;
      if (combinedVariability < RHYTHM_THRESHOLDS.HIGH_VARIABILITY) return null;
      return {
        observationConfidence: r.measurement.confidence,
        sampleCount: 15,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Combined size/spacing variability ${combinedVariability.toFixed(2)}`,
        regions: [],
      };
    },
  }),
];
