import { stdDev, mean } from "@/utils/stats";
import type { FeatureModuleResult, MarginMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

export function extractMargins(ctx: PipelineContext): FeatureModuleResult<MarginMeasurement> {
  const key = "margins";
  const label = "Margins";
  const comps = ctx.plausibleComponents;

  if (comps.length < 8 || ctx.lines.length < 2) {
    return {
      key,
      label,
      reliability: "reliable",
      available: false,
      unavailableReason: "Insufficient evidence: not enough writing detected to establish margins.",
    };
  }

  const minX = Math.min(...comps.map((c) => c.minX));
  const maxX = Math.max(...comps.map((c) => c.maxX));
  const minY = Math.min(...comps.map((c) => c.minY));
  const maxY = Math.max(...comps.map((c) => c.maxY));

  const leftRatio = minX / ctx.canvasWidth;
  const rightRatio = (ctx.canvasWidth - maxX) / ctx.canvasWidth;
  const topRatio = minY / ctx.canvasHeight;
  const bottomRatio = (ctx.canvasHeight - maxY) / ctx.canvasHeight;

  const lineStarts = ctx.lines
    .map((line) => {
      const lc = comps.filter((c) => c.lineIndex === line.index);
      return lc.length ? Math.min(...lc.map((c) => c.minX)) : null;
    })
    .filter((v): v is number => v !== null);

  const consistency = lineStarts.length > 1 ? Math.max(0, 1 - stdDev(lineStarts) / (mean(lineStarts) || 1)) : 0.5;

  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.9, 0.5 + readability * 0.35);

  const measurement: MarginMeasurement = {
    leftRatio: Number(leftRatio.toFixed(3)),
    rightRatio: Number(rightRatio.toFixed(3)),
    topRatio: Number(topRatio.toFixed(3)),
    bottomRatio: Number(bottomRatio.toFixed(3)),
    consistency: Number(consistency.toFixed(2)),
    confidence,
  };

  return {
    key,
    label,
    reliability: "reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-margins",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: lineStarts.length,
      regions: [
        componentRegion(comps.reduce((a, b) => (a.minX < b.minX ? a : b)), ctx.canvasWidth, ctx.canvasHeight, "Left margin edge"),
        componentRegion(comps.reduce((a, b) => (a.maxX > b.maxX ? a : b)), ctx.canvasWidth, ctx.canvasHeight, "Right margin edge"),
        componentRegion(comps.reduce((a, b) => (a.minY < b.minY ? a : b)), ctx.canvasWidth, ctx.canvasHeight, "Top margin edge"),
        componentRegion(comps.reduce((a, b) => (a.maxY > b.maxY ? a : b)), ctx.canvasWidth, ctx.canvasHeight, "Bottom margin edge"),
      ],
    },
  };
}
