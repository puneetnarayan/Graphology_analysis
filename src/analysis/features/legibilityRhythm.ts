import { laplacianVariance, noiseEstimate } from "@/utils/imageMetrics";
import { clamp, coefficientOfVariation } from "@/utils/stats";
import type { FeatureModuleResult, LegibilityMeasurement, RhythmMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

/** Spreads representative samples across the page rather than clustering at the start. */
function spreadSampleRegions(ctx: PipelineContext, limit = 10) {
  const comps = ctx.plausibleComponents;
  if (comps.length === 0) return [];
  const step = Math.max(1, Math.floor(comps.length / limit));
  const picked = [];
  for (let i = 0; i < comps.length && picked.length < limit; i += step) picked.push(comps[i]);
  return picked.map((c) => componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Sampled component"));
}

export function extractLegibility(ctx: PipelineContext): FeatureModuleResult<LegibilityMeasurement> {
  const key = "legibility";
  const label = "Legibility";
  const comps = ctx.plausibleComponents;

  if (comps.length < 10) {
    return {
      key,
      label,
      reliability: "conditionally_reliable",
      available: false,
      unavailableReason: "Insufficient evidence: not enough writing detected to estimate legibility.",
    };
  }

  const sharpness = clamp((laplacianVariance(ctx.gray) / 260) * 100, 0, 100);
  const sizeConsistency = clamp(100 - coefficientOfVariation(comps.map((c) => c.maxY - c.minY)) * 100, 0, 100);
  const qualityComponent = featureReadability(ctx, key);
  const score = clamp(sharpness * 0.3 + sizeConsistency * 0.35 + qualityComponent * 0.35, 0, 100);
  const confidence = clamp(0.4 + (qualityComponent / 100) * 0.4, 0.1, 0.9);

  const measurement: LegibilityMeasurement = {
    score: Math.round(score),
    consistency: Number((sizeConsistency / 100).toFixed(2)),
    confidence,
  };

  return {
    key,
    label,
    reliability: "conditionally_reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-legibility",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: comps.length,
      regions: spreadSampleRegions(ctx),
    },
  };
}

export function extractRhythm(ctx: PipelineContext): FeatureModuleResult<RhythmMeasurement> {
  const key = "rhythm";
  const label = "Rhythm & Speed";
  const comps = ctx.plausibleComponents;
  const allLetterGaps = ctx.lineWordData.flatMap((l) => l.letterGapPx);

  if (comps.length < 10 || allLetterGaps.length < 8) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: "Insufficient evidence: not enough strokes/spacing samples to assess rhythm indicators.",
    };
  }

  const noise = noiseEstimate(ctx.gray);
  const strokeContinuity = clamp(1 - noise, 0, 1);
  const sizeVariability = clamp(coefficientOfVariation(comps.map((c) => c.maxY - c.minY)), 0, 1.5) / 1.5;
  const spacingVariability = clamp(coefficientOfVariation(allLetterGaps), 0, 1.5) / 1.5;

  const readability = featureReadability(ctx, key) / 100;
  const confidence = clamp(0.25 + readability * 0.35 + Math.min(0.15, comps.length / 300), 0.1, 0.75);

  const measurement: RhythmMeasurement = {
    strokeContinuity: Number(strokeContinuity.toFixed(2)),
    sizeVariability: Number(sizeVariability.toFixed(2)),
    spacingVariability: Number(spacingVariability.toFixed(2)),
    confidence,
  };

  return {
    key,
    label,
    reliability: "experimental",
    available: true,
    measurement,
    observation: {
      id: "obs-rhythm",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: comps.length,
      regions: spreadSampleRegions(ctx),
    },
  };
}
