import { SLANT_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const slantRules: Rule[] = [
  defineRule({
    id: "SLANT-RIGHT-001",
    category: "slant",
    description: "Moderate-to-strong rightward slant",
    explanation:
      "A consistent rightward lean in strokes is traditionally read as forward-facing emotional and social engagement.",
    limitations: "Slant can be affected by hand dominance, writing posture, and paper angle.",
    ruleWeight: 0.7,
    effects: [
      { trait: "social_orientation", weight: 0.7, explanation: "Rightward slant → outward social engagement" },
      { trait: "emotional_expression", weight: 0.5, explanation: "Rightward slant → expressiveness" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.slant;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.classification !== "moderate_right" && s.measurement.classification !== "strong_right")
        return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.sampleCount,
        sufficiencyMin: SLANT_THRESHOLDS.MIN_SAMPLE_COUNT,
        sufficiencyFull: 60,
        measurementLabel: `Mean slant ${s.measurement.meanDegrees}° (${s.measurement.classification.replace("_", " ")})`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SLANT-LEFT-001",
    category: "slant",
    description: "Moderate-to-strong leftward slant",
    explanation: "A consistent leftward lean is traditionally read as reserve or a self-referential orientation.",
    limitations: "Left-handed writers commonly show leftward slant for purely mechanical reasons.",
    ruleWeight: 0.55,
    effects: [
      { trait: "independence", weight: 0.6, explanation: "Leftward slant → self-reliance" },
      { trait: "social_orientation", weight: -0.4, explanation: "Leftward slant → reserve" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.slant;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.classification !== "moderate_left" && s.measurement.classification !== "strong_left")
        return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.sampleCount,
        sufficiencyMin: SLANT_THRESHOLDS.MIN_SAMPLE_COUNT,
        sufficiencyFull: 60,
        measurementLabel: `Mean slant ${s.measurement.meanDegrees}° (${s.measurement.classification.replace("_", " ")})`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SLANT-VERTICAL-001",
    category: "slant",
    description: "Vertical (upright) slant",
    explanation: "Upright strokes are traditionally read as emotional self-containment and independent judgment.",
    ruleWeight: 0.6,
    effects: [
      { trait: "self_control", weight: 0.6, explanation: "Vertical slant → composure" },
      { trait: "independence", weight: 0.3, explanation: "Vertical slant → self-direction" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.slant;
      if (!s.available || !s.measurement || s.measurement.classification !== "vertical") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.sampleCount,
        sufficiencyMin: SLANT_THRESHOLDS.MIN_SAMPLE_COUNT,
        sufficiencyFull: 60,
        measurementLabel: `Mean slant ${s.measurement.meanDegrees}° (vertical)`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SLANT-VARIABLE-001",
    category: "slant",
    description: "Highly variable slant across the sample",
    explanation: "Wide swings in stroke angle within one sample are traditionally read as fluctuating emotional expression.",
    ruleWeight: 0.5,
    effects: [
      { trait: "stress_pressure", weight: 0.4, explanation: "Variable slant → emotional fluctuation" },
      { trait: "adaptability", weight: 0.3, explanation: "Variable slant → situational flexibility" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.slant;
      if (!s.available || !s.measurement || s.measurement.classification !== "variable") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.sampleCount,
        sufficiencyMin: SLANT_THRESHOLDS.MIN_SAMPLE_COUNT,
        sufficiencyFull: 60,
        measurementLabel: `Slant std. dev. ${s.measurement.stdDevDegrees}°`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
];
