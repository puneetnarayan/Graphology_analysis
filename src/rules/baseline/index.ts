import { BASELINE_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const baselineRules: Rule[] = [
  defineRule({
    id: "BASELINE-RISING-001",
    category: "baseline",
    description: "Rising baseline",
    explanation: "Lines that climb across the page are traditionally read as optimism and forward energy.",
    ruleWeight: 0.55,
    effects: [
      { trait: "energy_drive", weight: 0.5, explanation: "Rising baseline → forward momentum" },
      { trait: "confidence_assertiveness", weight: 0.4, explanation: "Rising baseline → optimism" },
    ],
    evaluate: (ctx) => {
      const b = ctx.features.baseline;
      if (!b.available || !b.measurement || b.measurement.classification !== "rising") return null;
      return {
        observationConfidence: b.measurement.confidence,
        sampleCount: b.measurement.lineCount,
        sufficiencyMin: BASELINE_THRESHOLDS.MIN_LINES,
        sufficiencyFull: 10,
        measurementLabel: `Mean baseline angle ${b.measurement.meanAngleDegrees}° (rising)`,
        regions: b.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "BASELINE-FALLING-001",
    category: "baseline",
    description: "Falling baseline",
    explanation: "Lines that descend across the page are traditionally read as fatigue or lowered mood at the time of writing.",
    ruleWeight: 0.55,
    effects: [
      { trait: "stress_pressure", weight: 0.5, explanation: "Falling baseline → strain" },
      { trait: "energy_drive", weight: -0.3, explanation: "Falling baseline → reduced momentum" },
    ],
    evaluate: (ctx) => {
      const b = ctx.features.baseline;
      if (!b.available || !b.measurement || b.measurement.classification !== "falling") return null;
      return {
        observationConfidence: b.measurement.confidence,
        sampleCount: b.measurement.lineCount,
        sufficiencyMin: BASELINE_THRESHOLDS.MIN_LINES,
        sufficiencyFull: 10,
        measurementLabel: `Mean baseline angle ${b.measurement.meanAngleDegrees}° (falling)`,
        regions: b.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "BASELINE-LEVEL-001",
    category: "baseline",
    description: "Level, steady baseline",
    explanation: "A level baseline is traditionally read as emotional steadiness and self-discipline.",
    ruleWeight: 0.6,
    effects: [
      { trait: "self_control", weight: 0.5, explanation: "Level baseline → discipline" },
      { trait: "organization", weight: 0.4, explanation: "Level baseline → orderliness" },
    ],
    evaluate: (ctx) => {
      const b = ctx.features.baseline;
      if (!b.available || !b.measurement || b.measurement.classification !== "level") return null;
      return {
        observationConfidence: b.measurement.confidence,
        sampleCount: b.measurement.lineCount,
        sufficiencyMin: BASELINE_THRESHOLDS.MIN_LINES,
        sufficiencyFull: 10,
        measurementLabel: `Mean baseline angle ${b.measurement.meanAngleDegrees}° (level)`,
        regions: b.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "BASELINE-WAVY-001",
    category: "baseline",
    description: "Wavy or highly variable baseline",
    explanation: "A baseline that wanders line to line is traditionally read as fluctuating mood or difficulty sustaining focus.",
    ruleWeight: 0.45,
    effects: [
      { trait: "stress_pressure", weight: 0.4, explanation: "Wavy baseline → inconsistency" },
      { trait: "adaptability", weight: -0.2, explanation: "Wavy baseline → difficulty sustaining direction" },
    ],
    evaluate: (ctx) => {
      const b = ctx.features.baseline;
      if (!b.available || !b.measurement || b.measurement.classification !== "wavy_variable") return null;
      return {
        observationConfidence: b.measurement.confidence,
        sampleCount: b.measurement.lineCount,
        sufficiencyMin: BASELINE_THRESHOLDS.MIN_LINES,
        sufficiencyFull: 10,
        measurementLabel: `Baseline variability ${b.measurement.variability}`,
        regions: b.observation?.regions ?? [],
      };
    },
  }),
];
