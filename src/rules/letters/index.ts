import { OVAL_THRESHOLDS, T_BAR_THRESHOLDS, I_DOT_THRESHOLDS, LETTER_SHAPE_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const letterRules: Rule[] = [
  defineRule({
    id: "OVAL-COMPRESSED-001",
    category: "ovals",
    description: "Compressed (narrow) oval letter forms",
    explanation: "Notably compressed a/o/e forms are traditionally read as guardedness or self-restraint in communication.",
    limitations: "Automated open/closed loop detection is experimental and should be treated as a rough proxy.",
    ruleWeight: 0.35,
    effects: [
      { trait: "self_control", weight: 0.35, explanation: "Compressed ovals → restraint" },
      { trait: "communication_style", weight: -0.25, explanation: "Compressed ovals → guardedness" },
    ],
    evaluate: (ctx) => {
      const o = ctx.features.ovals;
      if (!o.available || !o.measurement) return null;
      if (o.measurement.meanCompression < OVAL_THRESHOLDS.HIGH_COMPRESSION) return null;
      return {
        observationConfidence: o.measurement.confidence,
        sampleCount: o.measurement.reliableCount,
        sufficiencyMin: OVAL_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 25,
        measurementLabel: `Mean oval compression ${o.measurement.meanCompression}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "OVAL-OPEN-001",
    category: "ovals",
    description: "Notably open oval letter forms",
    explanation: "Open a/o/e forms are traditionally read as candor and a more expressive communication style.",
    limitations: "Automated open/closed loop detection is experimental and should be treated as a rough proxy.",
    ruleWeight: 0.3,
    effects: [
      { trait: "communication_style", weight: 0.4, explanation: "Open ovals → candor" },
      { trait: "social_orientation", weight: 0.25, explanation: "Open ovals → openness" },
    ],
    evaluate: (ctx) => {
      const o = ctx.features.ovals;
      if (!o.available || !o.measurement) return null;
      if (o.measurement.openFraction < OVAL_THRESHOLDS.OPEN_FRACTION_NOTABLE) return null;
      return {
        observationConfidence: o.measurement.confidence * 0.85,
        sampleCount: o.measurement.reliableCount,
        sufficiencyMin: OVAL_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 25,
        measurementLabel: `Open oval fraction ${(o.measurement.openFraction * 100).toFixed(0)}%`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "TBAR-HIGH-001",
    category: "t-bars",
    description: "High-placed t-bar crossings",
    explanation: "T-bars crossed high on the stem are traditionally read as elevated aspiration or goal-setting.",
    ruleWeight: 0.4,
    effects: [
      { trait: "goal_orientation", weight: 0.55, explanation: "High t-bar → aspiration" },
      { trait: "confidence_assertiveness", weight: 0.25, explanation: "High t-bar → self-assurance" },
    ],
    evaluate: (ctx) => {
      const t = ctx.features.tBars;
      if (!t.available || !t.measurement) return null;
      if (t.measurement.meanHeightRatio < T_BAR_THRESHOLDS.HIGH_PLACEMENT_RATIO) return null;
      return {
        observationConfidence: t.measurement.confidence,
        sampleCount: t.measurement.reliableCount,
        sufficiencyMin: T_BAR_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 20,
        measurementLabel: `Mean t-bar height ratio ${t.measurement.meanHeightRatio}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "TBAR-LOW-001",
    category: "t-bars",
    description: "Low-placed t-bar crossings",
    explanation: "T-bars crossed low on the stem are traditionally read as modest or cautious goal-setting.",
    ruleWeight: 0.4,
    effects: [{ trait: "goal_orientation", weight: -0.4, explanation: "Low t-bar → modest goals" }],
    evaluate: (ctx) => {
      const t = ctx.features.tBars;
      if (!t.available || !t.measurement) return null;
      if (t.measurement.meanHeightRatio > T_BAR_THRESHOLDS.LOW_PLACEMENT_RATIO) return null;
      return {
        observationConfidence: t.measurement.confidence,
        sampleCount: t.measurement.reliableCount,
        sufficiencyMin: T_BAR_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 20,
        measurementLabel: `Mean t-bar height ratio ${t.measurement.meanHeightRatio}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "IDOT-PRECISE-001",
    category: "i-dots",
    description: "Precisely placed, circular i-dots",
    explanation: "Consistently placed, round i-dots are traditionally read as attentiveness to detail.",
    ruleWeight: 0.35,
    effects: [{ trait: "attention_precision", weight: 0.5, explanation: "Precise i-dots → attentiveness" }],
    evaluate: (ctx) => {
      const i = ctx.features.iDots;
      if (!i.available || !i.measurement) return null;
      if (i.measurement.circularFraction < 0.6 || Math.abs(i.measurement.meanHorizontalOffsetRatio) > 0.15) return null;
      return {
        observationConfidence: i.measurement.confidence,
        sampleCount: i.measurement.reliableCount,
        sufficiencyMin: I_DOT_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 20,
        measurementLabel: `Circular i-dots ${(i.measurement.circularFraction * 100).toFixed(0)}%`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "IDOT-HIGH-001",
    category: "i-dots",
    description: "I-dots placed notably high above the stem",
    explanation: "I-dots placed well above their stem are traditionally read as an active, imaginative mental orientation.",
    ruleWeight: 0.3,
    effects: [{ trait: "imagination_creativity", weight: 0.4, explanation: "High i-dots → ideation" }],
    evaluate: (ctx) => {
      const i = ctx.features.iDots;
      if (!i.available || !i.measurement) return null;
      if (i.measurement.meanVerticalOffsetRatio < I_DOT_THRESHOLDS.HIGH_OFFSET_RATIO) return null;
      return {
        observationConfidence: i.measurement.confidence * 0.9,
        sampleCount: i.measurement.reliableCount,
        sufficiencyMin: I_DOT_THRESHOLDS.MIN_RELIABLE_COUNT,
        sufficiencyFull: 20,
        measurementLabel: `Mean i-dot vertical offset ${i.measurement.meanVerticalOffsetRatio}`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "LOOP-PREVALENCE-001",
    category: "letters",
    description: "High prevalence of loop-bearing letter shapes",
    explanation: "A sample dominated by looped forms (closed x-height loops, looped ascenders/descenders) is traditionally read as an imaginative, feeling-oriented communication style.",
    limitations: "This is a letter-agnostic shape census (topological hole detection), not per-letter OCR identification — it counts loops across the whole alphabet rather than confirming which specific letters produced them.",
    ruleWeight: 0.4,
    effects: [
      { trait: "imagination_creativity", weight: 0.45, explanation: "High loop prevalence → imaginative orientation" },
      { trait: "communication_style", weight: 0.2, explanation: "High loop prevalence → expressive, rounded forms" },
    ],
    evaluate: (ctx) => {
      const l = ctx.features.letterShapes;
      if (!l.available || !l.measurement) return null;
      if (l.measurement.loopFraction < LETTER_SHAPE_THRESHOLDS.HIGH_LOOP_FRACTION) return null;
      return {
        observationConfidence: l.measurement.confidence,
        sampleCount: l.measurement.totalClassified,
        sufficiencyMin: LETTER_SHAPE_THRESHOLDS.MIN_CLASSIFIED,
        sufficiencyFull: 60,
        measurementLabel: `Loop-bearing components: ${(l.measurement.loopFraction * 100).toFixed(0)}% of ${l.measurement.totalClassified} classified`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "STEM-PRECISION-001",
    category: "letters",
    description: "High prevalence of narrow, loopless stem forms",
    explanation: "A sample dominated by narrow, loopless stems (i/l/r-like forms without loops) is traditionally read as a precise, economical writing style.",
    limitations: "This is a letter-agnostic shape census (topological hole detection), not per-letter OCR identification.",
    ruleWeight: 0.35,
    effects: [{ trait: "attention_precision", weight: 0.4, explanation: "High narrow-stem prevalence → economical precision" }],
    evaluate: (ctx) => {
      const l = ctx.features.letterShapes;
      if (!l.available || !l.measurement) return null;
      if (l.measurement.narrowStemFraction < LETTER_SHAPE_THRESHOLDS.HIGH_STEM_FRACTION) return null;
      return {
        observationConfidence: l.measurement.confidence,
        sampleCount: l.measurement.totalClassified,
        sufficiencyMin: LETTER_SHAPE_THRESHOLDS.MIN_CLASSIFIED,
        sufficiencyFull: 60,
        measurementLabel: `Narrow-stem components: ${(l.measurement.narrowStemFraction * 100).toFixed(0)}% of ${l.measurement.totalClassified} classified`,
        regions: [],
      };
    },
  }),
];
