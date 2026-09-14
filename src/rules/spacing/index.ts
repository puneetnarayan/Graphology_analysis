import { SPACING_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const spacingRules: Rule[] = [
  defineRule({
    id: "SPACING-WORD-NARROW-001",
    category: "spacing",
    description: "Narrow word spacing",
    explanation: "Words placed close together are traditionally read as a lower need for interpersonal distance.",
    ruleWeight: 0.55,
    effects: [
      { trait: "social_orientation", weight: 0.35, explanation: "Narrow word spacing → comfort with closeness" },
      { trait: "independence", weight: -0.3, explanation: "Narrow word spacing → lower need for separation" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.spacing;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.wordClass !== "narrow" && s.measurement.wordClass !== "very_narrow") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.wordSampleCount,
        sufficiencyMin: SPACING_THRESHOLDS.MIN_WORD_SAMPLE,
        sufficiencyFull: 60,
        measurementLabel: `Word spacing ${s.measurement.wordSpacingRatio}× median letter width (${s.measurement.wordClass})`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SPACING-WORD-WIDE-001",
    category: "spacing",
    description: "Wide word spacing",
    explanation: "Words placed well apart are traditionally read as a stronger need for personal space or independence.",
    ruleWeight: 0.55,
    effects: [
      { trait: "independence", weight: 0.5, explanation: "Wide word spacing → need for personal boundaries" },
      { trait: "social_orientation", weight: -0.35, explanation: "Wide word spacing → selective engagement" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.spacing;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.wordClass !== "wide" && s.measurement.wordClass !== "very_wide") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.wordSampleCount,
        sufficiencyMin: SPACING_THRESHOLDS.MIN_WORD_SAMPLE,
        sufficiencyFull: 60,
        measurementLabel: `Word spacing ${s.measurement.wordSpacingRatio}× median letter width (${s.measurement.wordClass})`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SPACING-LETTER-NARROW-001",
    category: "spacing",
    description: "Narrow letter spacing within words",
    explanation: "Tightly packed letters within words are traditionally read as self-restraint.",
    ruleWeight: 0.4,
    effects: [{ trait: "self_control", weight: 0.35, explanation: "Narrow letter spacing → restraint" }],
    evaluate: (ctx) => {
      const s = ctx.features.spacing;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.letterClass !== "narrow" && s.measurement.letterClass !== "very_narrow") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.wordSampleCount,
        sufficiencyMin: SPACING_THRESHOLDS.MIN_WORD_SAMPLE,
        sufficiencyFull: 60,
        measurementLabel: `Letter spacing ${s.measurement.letterSpacingRatio}× median letter width`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
  defineRule({
    id: "SPACING-LINE-WIDE-001",
    category: "spacing",
    description: "Wide line spacing",
    explanation: "Generous space between lines is traditionally read as a preference for clarity and mental organization.",
    ruleWeight: 0.45,
    effects: [
      { trait: "organization", weight: 0.4, explanation: "Wide line spacing → clarity of thought" },
      { trait: "communication_style", weight: 0.3, explanation: "Wide line spacing → clear expression" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.spacing;
      if (!s.available || !s.measurement) return null;
      if (s.measurement.lineClass !== "wide" && s.measurement.lineClass !== "very_wide") return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: s.measurement.wordSampleCount,
        sufficiencyMin: SPACING_THRESHOLDS.MIN_WORD_SAMPLE,
        sufficiencyFull: 60,
        measurementLabel: `Line spacing ${s.measurement.lineSpacingRatio}× middle-zone height`,
        regions: s.observation?.regions ?? [],
      };
    },
  }),
];
