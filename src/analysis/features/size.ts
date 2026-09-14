import { SIZE_THRESHOLDS } from "@/config/thresholds";
import { coefficientOfVariation, mean, median } from "@/utils/stats";
import type { FeatureModuleResult, SizeMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

export function extractSize(ctx: PipelineContext): FeatureModuleResult<SizeMeasurement> {
  const key = "size";
  const label = "Size";
  const comps = ctx.plausibleComponents;

  if (comps.length < 10) {
    return {
      key,
      label,
      reliability: "reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only ${comps.length} letter-like components detected (minimum 10 required).`,
    };
  }

  const bandByLine = new Map(ctx.xHeightBands.map((b) => [b.lineIndex, b]));
  const heights: number[] = [];
  const widths: number[] = [];
  const upperExtensions: number[] = [];
  const lowerExtensions: number[] = [];
  for (const c of comps) {
    const h = c.maxY - c.minY + 1;
    const w = c.maxX - c.minX + 1;
    heights.push(h);
    widths.push(w);
    const band = bandByLine.get(c.lineIndex);
    if (band) {
      if (c.minY < band.top - 1) {
        upperExtensions.push((band.top - c.minY) / band.height);
      }
      if (c.maxY > band.bottom + 1) {
        lowerExtensions.push((c.maxY - band.bottom) / band.height);
      }
    }
  }

  const meanMiddleZoneHeightPx = median(comps.map((c) => c.maxY - c.minY + 1));
  const upperZoneRatio = upperExtensions.length ? mean(upperExtensions) : 0;
  const lowerZoneRatio = lowerExtensions.length ? mean(lowerExtensions) : 0;
  const widthHeightRatio = mean(widths.map((w, i) => w / Math.max(1, heights[i])));
  const variationCoefficient = coefficientOfVariation(heights);

  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.95, 0.45 + readability * 0.4 + Math.min(0.1, comps.length / 400));

  const measurement: SizeMeasurement = {
    meanMiddleZoneHeightPx: Number(meanMiddleZoneHeightPx.toFixed(1)),
    upperZoneRatio: Number(upperZoneRatio.toFixed(2)),
    lowerZoneRatio: Number(lowerZoneRatio.toFixed(2)),
    widthHeightRatio: Number(widthHeightRatio.toFixed(2)),
    variationCoefficient: Number(variationCoefficient.toFixed(2)),
    confidence,
  };

  const sorted = [...comps].sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY));
  const regions = sorted.slice(0, 5).map((c) => componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Size sample"));

  return {
    key,
    label,
    reliability: "reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-size",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: comps.length,
      regions,
    },
  };
}

export const SIZE_CLASS_LABEL = (heightPx: number): string => {
  if (heightPx <= SIZE_THRESHOLDS.SMALL_MAX_PX) return "Small";
  if (heightPx >= SIZE_THRESHOLDS.LARGE_MIN_PX) return "Large";
  return "Medium";
};
