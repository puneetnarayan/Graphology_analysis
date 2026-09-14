import { defineRule, type Rule } from "../schema";

export const marginRules: Rule[] = [
  defineRule({
    id: "MARGIN-LEFT-WIDE-001",
    category: "margins",
    description: "Wide left margin",
    explanation: "A generous left margin is traditionally read as a degree of reserve toward one's own past or origins, or a preference for a clean start.",
    ruleWeight: 0.35,
    effects: [{ trait: "independence", weight: 0.3, explanation: "Wide left margin → self-sufficiency" }],
    evaluate: (ctx) => {
      const m = ctx.features.margins;
      if (!m.available || !m.measurement) return null;
      if (m.measurement.leftRatio < 0.14) return null;
      return {
        observationConfidence: m.measurement.confidence,
        sampleCount: 10,
        sufficiencyMin: 3,
        sufficiencyFull: 10,
        measurementLabel: `Left margin ${(m.measurement.leftRatio * 100).toFixed(0)}% of page width`,
        regions: m.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "MARGIN-CONSISTENT-001",
    category: "margins",
    description: "Highly consistent left margin across lines",
    explanation: "A steady left margin from line to line is traditionally read as organizational discipline.",
    ruleWeight: 0.45,
    effects: [{ trait: "organization", weight: 0.5, explanation: "Consistent margin → planning/discipline" }],
    evaluate: (ctx) => {
      const m = ctx.features.margins;
      if (!m.available || !m.measurement) return null;
      if (m.measurement.consistency < 0.75) return null;
      return {
        observationConfidence: m.measurement.confidence,
        sampleCount: 10,
        sufficiencyMin: 3,
        sufficiencyFull: 10,
        measurementLabel: `Left margin consistency ${(m.measurement.consistency * 100).toFixed(0)}%`,
        regions: m.observation?.regions ?? [],
      };
    },
  }),
];
