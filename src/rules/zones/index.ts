import { ZONE_THRESHOLDS } from "@/config/thresholds";
import { defineRule, type Rule } from "../schema";

export const zoneRules: Rule[] = [
  defineRule({
    id: "ZONE-UPPER-DOMINANT-001",
    category: "zones",
    description: "Dominant, extended upper zone",
    explanation: "Pronounced ascenders (upper zone) are traditionally read as an active intellectual or imaginative orientation.",
    ruleWeight: 0.45,
    effects: [
      { trait: "imagination_creativity", weight: 0.5, explanation: "Extended upper zone → ideation" },
      { trait: "goal_orientation", weight: 0.3, explanation: "Extended upper zone → aspiration" },
    ],
    evaluate: (ctx) => {
      const z = ctx.features.zones;
      if (!z.available || !z.measurement) return null;
      const upper = z.measurement.find((m) => m.zone === "upper");
      if (!upper || upper.observationCount < 5) return null;
      if (upper.relativeExtension < ZONE_THRESHOLDS.DOMINANT_EXTENSION || upper.frequency < 0.25) return null;
      return {
        observationConfidence: upper.confidence,
        sampleCount: upper.observationCount,
        sufficiencyMin: 5,
        sufficiencyFull: ZONE_THRESHOLDS.MIN_OBSERVATIONS,
        measurementLabel: `Upper-zone extension ${upper.relativeExtension}×, frequency ${(upper.frequency * 100).toFixed(0)}%`,
        regions: [],
      };
    },
  }),
  defineRule({
    id: "ZONE-LOWER-DOMINANT-001",
    category: "zones",
    description: "Dominant, extended lower zone",
    explanation: "Pronounced descenders (lower zone) are traditionally read as an emphasis on material, physical or instinctual concerns.",
    ruleWeight: 0.45,
    effects: [
      { trait: "energy_drive", weight: 0.4, explanation: "Extended lower zone → drive/vitality" },
      { trait: "stress_pressure", weight: 0.2, explanation: "Extended lower zone → grounding pressure" },
    ],
    evaluate: (ctx) => {
      const z = ctx.features.zones;
      if (!z.available || !z.measurement) return null;
      const lower = z.measurement.find((m) => m.zone === "lower");
      if (!lower || lower.observationCount < 5) return null;
      if (lower.relativeExtension < ZONE_THRESHOLDS.DOMINANT_EXTENSION || lower.frequency < 0.25) return null;
      return {
        observationConfidence: lower.confidence,
        sampleCount: lower.observationCount,
        sufficiencyMin: 5,
        sufficiencyFull: ZONE_THRESHOLDS.MIN_OBSERVATIONS,
        measurementLabel: `Lower-zone extension ${lower.relativeExtension}×, frequency ${(lower.frequency * 100).toFixed(0)}%`,
        regions: [],
      };
    },
  }),
];
