import { defineRule, type Rule } from "../schema";

export const pressureRules: Rule[] = [
  defineRule({
    id: "PRESSURE-HEAVY-001",
    category: "pressure",
    description: "Heavy-to-medium-heavy pressure proxy",
    explanation: "Darker, denser strokes are traditionally read as strong emotional and physical energy investment in writing.",
    limitations: "This is an image-derived proxy, not a direct physical pressure measurement.",
    ruleWeight: 0.5,
    effects: [
      { trait: "energy_drive", weight: 0.6, explanation: "Heavy pressure proxy → high energy investment" },
      { trait: "stress_pressure", weight: 0.3, explanation: "Heavy pressure proxy → intensity" },
    ],
    evaluate: (ctx) => {
      const p = ctx.features.pressure;
      if (!p.available || !p.measurement) return null;
      if (p.measurement.estimated !== "heavy" && p.measurement.estimated !== "medium_heavy") return null;
      return {
        observationConfidence: p.measurement.confidence,
        sampleCount: 20,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Pressure proxy: ${p.measurement.estimated.replace("_", "-")}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "PRESSURE-LIGHT-001",
    category: "pressure",
    description: "Light pressure proxy",
    explanation: "Lighter, thinner strokes are traditionally read as lower physical energy investment or a more delicate touch.",
    limitations: "This is an image-derived proxy, not a direct physical pressure measurement.",
    ruleWeight: 0.5,
    effects: [
      { trait: "energy_drive", weight: -0.4, explanation: "Light pressure proxy → reserved energy" },
      { trait: "adaptability", weight: 0.3, explanation: "Light pressure proxy → gentle adaptability" },
    ],
    evaluate: (ctx) => {
      const p = ctx.features.pressure;
      if (!p.available || !p.measurement || p.measurement.estimated !== "light") return null;
      return {
        observationConfidence: p.measurement.confidence,
        sampleCount: 20,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: "Pressure proxy: light",
        regions: [],
      };
    },
  }),
  defineRule({
    id: "PRESSURE-CONSISTENT-001",
    category: "pressure",
    description: "Highly consistent stroke width",
    explanation: "Consistent apparent stroke width across the sample is traditionally read as steady self-regulation.",
    ruleWeight: 0.4,
    effects: [{ trait: "self_control", weight: 0.4, explanation: "Consistent stroke width → steadiness" }],
    evaluate: (ctx) => {
      const p = ctx.features.pressure;
      if (!p.available || !p.measurement) return null;
      if (p.measurement.strokeWidthConsistency < 0.7) return null;
      return {
        observationConfidence: p.measurement.confidence,
        sampleCount: 20,
        sufficiencyMin: 10,
        sufficiencyFull: 40,
        measurementLabel: `Stroke width consistency ${(p.measurement.strokeWidthConsistency * 100).toFixed(0)}%`,
        regions: [],
      };
    },
  }),
];
