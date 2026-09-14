import { BASELINE_THRESHOLDS } from "@/config/thresholds";
import { estimateBaseline } from "@/utils/segmentation";
import { mean, stdDev } from "@/utils/stats";
import type { BaselineClass, BaselineMeasurement, FeatureModuleResult } from "@/types";
import { lineRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

function classify(meanAngle: number, variability: number): BaselineClass {
  if (variability > BASELINE_THRESHOLDS.WAVY_VARIABILITY) return "wavy_variable";
  if (meanAngle < -BASELINE_THRESHOLDS.LEVEL_BAND_DEGREES) return "rising";
  if (meanAngle > BASELINE_THRESHOLDS.LEVEL_BAND_DEGREES) return "falling";
  return "level";
}

export function extractBaseline(ctx: PipelineContext): FeatureModuleResult<BaselineMeasurement> {
  const key = "baseline";
  const label = "Baseline";

  if (ctx.lines.length < BASELINE_THRESHOLDS.MIN_LINES) {
    return {
      key,
      label,
      reliability: "reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only ${ctx.lines.length} writing line(s) detected (minimum ${BASELINE_THRESHOLDS.MIN_LINES} required).`,
    };
  }

  const perLine = ctx.lines.map((line) => ({ line, result: estimateBaseline(ctx.mask, ctx.canvasWidth, line) }));
  const validLines = perLine.filter((p) => p.result.points.length >= 3);

  if (validLines.length < BASELINE_THRESHOLDS.MIN_LINES) {
    return {
      key,
      label,
      reliability: "reliable",
      available: false,
      unavailableReason: "Insufficient evidence: could not reliably trace enough baseline points across lines.",
    };
  }

  const angles = validLines.map((p) => p.result.angleDegrees);
  const curvatures = validLines.map((p) => p.result.curvature);
  const meanAngle = mean(angles);
  const variability = Math.min(1, stdDev(angles) / 4 + mean(curvatures));

  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.95, 0.4 + readability * 0.45 + Math.min(0.15, validLines.length / 40));

  const measurement: BaselineMeasurement = {
    meanAngleDegrees: Number(meanAngle.toFixed(1)),
    curvature: Number(mean(curvatures).toFixed(3)),
    classification: classify(meanAngle, variability),
    lineCount: validLines.length,
    variability: Number(variability.toFixed(3)),
    confidence,
  };

  const regions = validLines
    .slice(0, 6)
    .map((p) => lineRegion(p.line, ctx.canvasWidth, ctx.canvasHeight, `Line ${p.line.index + 1} baseline`));

  return {
    key,
    label,
    reliability: "reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-baseline",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: validLines.length,
      regions,
    },
  };
}
