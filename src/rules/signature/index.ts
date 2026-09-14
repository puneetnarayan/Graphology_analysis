import { SIGNATURE_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const signatureRules: Rule[] = [
  defineRule({
    id: "SIGNATURE-LARGER-001",
    category: "signature",
    description: "Signature notably larger than body text",
    explanation: "A signature larger than the body handwriting is traditionally read as a confident, more assertive public persona.",
    limitations: "Automatic signature detection is heuristic; confirm the signature region manually for reliable findings.",
    ruleWeight: 0.4,
    effects: [{ trait: "confidence_assertiveness", weight: 0.5, explanation: "Larger signature → public confidence" }],
    evaluate: (ctx) => {
      const s = ctx.features.signature;
      if (!s.available || !s.measurement || !s.measurement.detected || s.measurement.sizeRatioToBody === null) return null;
      if (s.measurement.sizeRatioToBody < 1 + SIGNATURE_THRESHOLDS.SIZE_DELTA_NOTABLE) return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: 1,
        sufficiencyMin: 1,
        sufficiencyFull: 1,
        measurementLabel: `Signature ${s.measurement.sizeRatioToBody}× body text height`,
        regions: s.measurement.region ? [{ ...s.measurement.region, label: "Signature" }] : [],
      };
    },
  }),
  defineRule({
    id: "SIGNATURE-SMALLER-001",
    category: "signature",
    description: "Signature notably smaller than body text",
    explanation: "A signature smaller than the body handwriting is traditionally read as a more private or understated public persona.",
    limitations: "Automatic signature detection is heuristic; confirm the signature region manually for reliable findings.",
    ruleWeight: 0.4,
    effects: [
      { trait: "self_control", weight: 0.3, explanation: "Smaller signature → understated presence" },
      { trait: "communication_style", weight: -0.2, explanation: "Smaller signature → private persona" },
    ],
    evaluate: (ctx) => {
      const s = ctx.features.signature;
      if (!s.available || !s.measurement || !s.measurement.detected || s.measurement.sizeRatioToBody === null) return null;
      if (s.measurement.sizeRatioToBody > 1 - SIGNATURE_THRESHOLDS.SIZE_DELTA_NOTABLE) return null;
      return {
        observationConfidence: s.measurement.confidence,
        sampleCount: 1,
        sufficiencyMin: 1,
        sufficiencyFull: 1,
        measurementLabel: `Signature ${s.measurement.sizeRatioToBody}× body text height`,
        regions: s.measurement.region ? [{ ...s.measurement.region, label: "Signature" }] : [],
      };
    },
  }),
];
