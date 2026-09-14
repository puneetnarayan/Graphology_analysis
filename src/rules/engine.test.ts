import { describe, expect, it } from "vitest";
import { runRuleEngine } from "./engine";
import { baseFeatures, fullQualityReport, stubPipelineContext } from "./testFixtures";
import { SLANT_THRESHOLDS } from "@/config/thresholds";

describe("rule engine: SLANT-RIGHT-001", () => {
  it("activates on a confident, well-sampled rightward slant", () => {
    const features = baseFeatures();
    features.slant = {
      key: "slant",
      label: "Slant",
      reliability: "conditionally_reliable",
      available: true,
      measurement: {
        meanDegrees: 14,
        medianDegrees: 13.5,
        stdDevDegrees: 4,
        classification: "moderate_right",
        sampleCount: 37,
        confidence: 0.9,
      },
      observation: { id: "obs-slant", value: {} as never, confidence: 0.9, source: "automatic", sampleCount: 37, regions: [] },
    };

    const output = runRuleEngine(features, stubPipelineContext(), fullQualityReport(95));
    const activation = output.ruleActivations.find((a) => a.ruleId === "SLANT-RIGHT-001");
    expect(activation).toBeDefined();
    expect(activation!.effectiveWeight).toBeGreaterThan(0);

    const socialTrait = output.traitScores.find((t) => t.trait === "social_orientation");
    expect(socialTrait?.available).toBe(true);
    expect(socialTrait!.score).toBeGreaterThan(50);
  });

  it("does not activate with an insufficient sample count", () => {
    const features = baseFeatures();
    features.slant = {
      key: "slant",
      label: "Slant",
      reliability: "conditionally_reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only 3 usable vertical strokes detected (minimum ${SLANT_THRESHOLDS.MIN_SAMPLE_COUNT} required).`,
    };

    const output = runRuleEngine(features, stubPipelineContext(), fullQualityReport(95));
    expect(output.ruleActivations.find((a) => a.ruleId === "SLANT-RIGHT-001")).toBeUndefined();
  });

  it("does not activate when observation confidence is below the activation floor", () => {
    const features = baseFeatures();
    features.slant = {
      key: "slant",
      label: "Slant",
      reliability: "conditionally_reliable",
      available: true,
      measurement: {
        meanDegrees: 14,
        medianDegrees: 13.5,
        stdDevDegrees: 4,
        classification: "moderate_right",
        sampleCount: 37,
        confidence: 0.1, // below CONFIDENCE_THRESHOLDS.MIN_RULE_ACTIVATION_CONFIDENCE
      },
      observation: { id: "obs-slant", value: {} as never, confidence: 0.1, source: "automatic", sampleCount: 37, regions: [] },
    };

    const output = runRuleEngine(features, stubPipelineContext(), fullQualityReport(95));
    expect(output.ruleActivations.find((a) => a.ruleId === "SLANT-RIGHT-001")).toBeUndefined();
  });

  it("degrades effective weight (but does not necessarily zero it) under poor scan quality", () => {
    const features = baseFeatures();
    features.slant = {
      key: "slant",
      label: "Slant",
      reliability: "conditionally_reliable",
      available: true,
      measurement: {
        meanDegrees: 14,
        medianDegrees: 13.5,
        stdDevDegrees: 4,
        classification: "moderate_right",
        sampleCount: 37,
        confidence: 0.9,
      },
      observation: { id: "obs-slant", value: {} as never, confidence: 0.9, source: "automatic", sampleCount: 37, regions: [] },
    };

    const goodQuality = runRuleEngine(features, stubPipelineContext(), fullQualityReport(95));
    const poorQuality = runRuleEngine(features, stubPipelineContext(), fullQualityReport(15));

    const goodActivation = goodQuality.ruleActivations.find((a) => a.ruleId === "SLANT-RIGHT-001");
    const poorActivation = poorQuality.ruleActivations.find((a) => a.ruleId === "SLANT-RIGHT-001");
    expect(goodActivation).toBeDefined();
    if (poorActivation) {
      expect(poorActivation.effectiveWeight).toBeLessThan(goodActivation!.effectiveWeight);
    }
  });
});

describe("rule engine: contradiction detection", () => {
  it("flags a contradiction when opposing rules both meaningfully support a trait", () => {
    const features = baseFeatures();
    // Wide word spacing -> independence (+), narrow letter spacing -> self_control only,
    // so instead use baseline rising (+energy_drive) vs falling (-energy_drive) — but a
    // single baseline measurement can't be both. Use size (large -> +energy_drive via
    // confidence_assertiveness) and pressure light (-energy_drive) to create a genuine
    // same-trait contradiction on energy_drive.
    features.size = {
      key: "size",
      label: "Size",
      reliability: "reliable",
      available: true,
      measurement: {
        meanMiddleZoneHeightPx: 34,
        upperZoneRatio: 0.3,
        lowerZoneRatio: 0.3,
        widthHeightRatio: 1,
        variationCoefficient: 0.1,
        confidence: 0.9,
      },
      observation: { id: "obs-size", value: {} as never, confidence: 0.9, source: "automatic", sampleCount: 50, regions: [] },
    };
    features.pressure = {
      key: "pressure",
      label: "Pressure Proxy",
      reliability: "experimental",
      available: true,
      measurement: {
        estimated: "light",
        confidence: 0.8,
        strokeDarkness: 0.2,
        strokeDensity: 0.2,
        strokeWidthConsistency: 0.5,
      },
      observation: { id: "obs-pressure", value: {} as never, confidence: 0.8, source: "automatic", sampleCount: 20 },
    };

    const output = runRuleEngine(features, stubPipelineContext(), fullQualityReport(95));
    const energyContradiction = output.contradictions.find((c) => c.trait === "energy_drive");
    expect(energyContradiction).toBeDefined();
  });
});
