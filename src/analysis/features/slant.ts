import { SLANT_THRESHOLDS } from "@/config/thresholds";
import { principalAxisAngleFromVertical, radToDeg } from "@/utils/geometry";
import { median, mean, stdDev } from "@/utils/stats";
import type { FeatureModuleResult, SlantClass, SlantMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

function classify(meanDeg: number, sd: number): SlantClass {
  if (sd > SLANT_THRESHOLDS.VARIABLE_STD_DEV) return "variable";
  if (Math.abs(meanDeg) <= SLANT_THRESHOLDS.VERTICAL_BAND) return "vertical";
  if (meanDeg > 0) return meanDeg > SLANT_THRESHOLDS.MODERATE_MAX ? "strong_right" : "moderate_right";
  return meanDeg < -SLANT_THRESHOLDS.MODERATE_MAX ? "strong_left" : "moderate_left";
}

export function extractSlant(ctx: PipelineContext): FeatureModuleResult<SlantMeasurement> {
  const key = "slant";
  const label = "Slant";

  const candidates = ctx.plausibleComponents.filter((c) => {
    const h = c.maxY - c.minY + 1;
    const w = c.maxX - c.minX + 1;
    return h > w * 1.05 && h >= 6;
  });

  const angles: number[] = [];
  const angleComponents: typeof candidates = [];
  for (const c of candidates) {
    const angleFromVertical = principalAxisAngleFromVertical(c.moments);
    if (angleFromVertical === null) continue;
    const deg = radToDeg(angleFromVertical);
    if (Math.abs(deg) > 55) continue; // implausible for handwriting strokes, likely noise
    angles.push(deg);
    angleComponents.push(c);
  }

  if (angles.length < SLANT_THRESHOLDS.MIN_SAMPLE_COUNT) {
    return {
      key,
      label,
      reliability: "conditionally_reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only ${angles.length} usable vertical strokes detected (minimum ${SLANT_THRESHOLDS.MIN_SAMPLE_COUNT} required for a reliable slant estimate).`,
    };
  }

  const meanDeg = mean(angles);
  const medianDeg = median(angles);
  const sd = stdDev(angles);
  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.97, 0.35 + readability * 0.4 + Math.min(0.25, angles.length / 200));

  const sampleRegions = angleComponents
    .slice()
    .sort((a, b) => Math.abs(radToDeg(principalAxisAngleFromVertical(b.moments) ?? 0) - meanDeg) - Math.abs(radToDeg(principalAxisAngleFromVertical(a.moments) ?? 0) - meanDeg))
    .slice(0, 6)
    .map((c) => componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Representative stroke"));

  const measurement: SlantMeasurement = {
    meanDegrees: Number(meanDeg.toFixed(1)),
    medianDegrees: Number(medianDeg.toFixed(1)),
    stdDevDegrees: Number(sd.toFixed(1)),
    classification: classify(meanDeg, sd),
    sampleCount: angles.length,
    confidence,
  };

  return {
    key,
    label,
    reliability: "conditionally_reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-slant",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: angles.length,
      regions: sampleRegions,
    },
  };
}
