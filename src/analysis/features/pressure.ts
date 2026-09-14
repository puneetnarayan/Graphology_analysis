import { PRESSURE_THRESHOLDS } from "@/config/thresholds";
import { clamp, coefficientOfVariation } from "@/utils/stats";
import type { FeatureModuleResult, PressureClass, PressureProxyMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

function classify(score: number): PressureClass {
  if (score < PRESSURE_THRESHOLDS.LIGHT_MAX) return "light";
  if (score < PRESSURE_THRESHOLDS.MEDIUM_MAX) return "light_medium";
  if (score < PRESSURE_THRESHOLDS.MEDIUM_HEAVY_MAX) return "medium";
  return "heavy";
}

/**
 * IMPORTANT: this is an image-derived pressure PROXY, not a physical
 * pressure measurement. A standard flatbed/phone scan carries no sensor
 * data about how hard the pen was pressed; this module infers plausible
 * correlates (ink darkness, apparent stroke width and its consistency,
 * local density) and is explicitly labeled experimental (spec §12).
 */
export function extractPressure(ctx: PipelineContext): FeatureModuleResult<PressureProxyMeasurement> {
  const key = "pressure";
  const label = "Pressure Proxy";
  const comps = ctx.plausibleComponents;

  if (comps.length < 10) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: "Insufficient evidence: not enough ink strokes detected to estimate a pressure proxy.",
    };
  }

  let inkSum = 0;
  let inkCount = 0;
  for (let i = 0; i < ctx.mask.length; i += 1) {
    if (ctx.mask[i] === 1) {
      inkSum += ctx.gray.data[i];
      inkCount += 1;
    }
  }
  const meanInkGray = inkCount ? inkSum / inkCount : 200;
  const strokeDarkness = clamp(1 - meanInkGray / 255, 0, 1);

  const writingArea =
    (Math.max(...comps.map((c) => c.maxX)) - Math.min(...comps.map((c) => c.minX))) *
    (Math.max(...comps.map((c) => c.maxY)) - Math.min(...comps.map((c) => c.minY)));
  const strokeDensity = clamp(inkCount / Math.max(1, writingArea), 0, 1) * 3.2;

  const runWidths: number[] = [];
  for (let y = 0; y < ctx.canvasHeight; y += 3) {
    let runLen = 0;
    for (let x = 0; x < ctx.canvasWidth; x += 1) {
      if (ctx.mask[y * ctx.canvasWidth + x] === 1) {
        runLen += 1;
      } else if (runLen > 0) {
        if (runLen < 25) runWidths.push(runLen);
        runLen = 0;
      }
    }
  }
  const strokeWidthConsistency = clamp(1 - coefficientOfVariation(runWidths), 0, 1);

  const qualityReadiness = featureReadability(ctx, key);
  const rawScore = clamp(strokeDarkness * 0.5 + clamp(strokeDensity, 0, 1) * 0.3 + strokeWidthConsistency * 0.2, 0, 1);

  let confidence = 0.3 + strokeWidthConsistency * 0.15 + strokeDarkness * 0.1;
  let suitabilityWarning: string | undefined;
  if (qualityReadiness < PRESSURE_THRESHOLDS.MIN_IMAGE_QUALITY_FOR_INFERENCE) {
    confidence *= 0.55;
    suitabilityWarning =
      "Scan quality in analyzed regions is below the recommended threshold for pressure inference; treat this estimate with caution.";
  }
  confidence = clamp(confidence, 0.05, 0.85);

  const measurement: PressureProxyMeasurement = {
    estimated: classify(rawScore),
    confidence: Number(confidence.toFixed(2)),
    strokeDarkness: Number(strokeDarkness.toFixed(2)),
    strokeDensity: Number(clamp(strokeDensity, 0, 1).toFixed(2)),
    strokeWidthConsistency: Number(strokeWidthConsistency.toFixed(2)),
    suitabilityWarning,
  };

  return {
    key,
    label,
    reliability: "experimental",
    available: true,
    measurement,
    observation: {
      id: "obs-pressure",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: comps.length,
      notes: "Image-derived pressure proxy. Physical pen pressure cannot be measured from a standard scan.",
      regions: [...comps]
        .sort((a, b) => b.area - a.area)
        .slice(0, 10)
        .map((c) => componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Sampled for ink density")),
    },
  };
}
