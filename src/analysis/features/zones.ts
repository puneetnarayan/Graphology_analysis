import { ZONE_THRESHOLDS } from "@/config/thresholds";
import { coefficientOfVariation, mean } from "@/utils/stats";
import type { FeatureModuleResult, ImageRegion, ZoneMeasurement } from "@/types";
import { componentRegion } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

export function extractZones(ctx: PipelineContext): FeatureModuleResult<ZoneMeasurement[]> {
  const key = "zones";
  const label = "Zones";
  const comps = ctx.plausibleComponents;
  const bandByLine = new Map(ctx.xHeightBands.map((b) => [b.lineIndex, b]));

  if (comps.length < ZONE_THRESHOLDS.MIN_OBSERVATIONS) {
    return {
      key,
      label,
      reliability: "conditionally_reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only ${comps.length} components observed (minimum ${ZONE_THRESHOLDS.MIN_OBSERVATIONS} required).`,
    };
  }

  const upperExt: number[] = [];
  const lowerExt: number[] = [];
  const middleExt: number[] = [];
  let upperCount = 0;
  let lowerCount = 0;
  const upperRegions: ImageRegion[] = [];
  const lowerRegions: ImageRegion[] = [];
  const middleRegions: ImageRegion[] = [];

  for (const c of comps) {
    const band = bandByLine.get(c.lineIndex);
    if (!band) continue;
    middleExt.push(1);
    if (middleRegions.length < 6) middleRegions.push(componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Middle zone"));
    if (c.minY < band.top - 1) {
      upperExt.push((band.top - c.minY) / band.height);
      upperCount += 1;
      if (upperRegions.length < 10) upperRegions.push(componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Upper-zone extension"));
    }
    if (c.maxY > band.bottom + 1) {
      lowerExt.push((c.maxY - band.bottom) / band.height);
      lowerCount += 1;
      if (lowerRegions.length < 10) lowerRegions.push(componentRegion(c, ctx.canvasWidth, ctx.canvasHeight, "Lower-zone extension"));
    }
  }

  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.9, 0.4 + readability * 0.4 + Math.min(0.15, comps.length / 300));

  const measurement: ZoneMeasurement[] = [
    {
      zone: "upper",
      relativeExtension: Number((upperExt.length ? mean(upperExt) : 0).toFixed(2)),
      frequency: Number((upperCount / comps.length).toFixed(2)),
      consistency: Number((1 - Math.min(1, coefficientOfVariation(upperExt))).toFixed(2)),
      observationCount: upperCount,
      confidence: upperCount >= 5 ? confidence : confidence * 0.5,
      sampleRegions: upperRegions,
    },
    {
      zone: "middle",
      relativeExtension: 1,
      frequency: 1,
      consistency: Number((1 - Math.min(1, coefficientOfVariation(comps.map((c) => c.maxY - c.minY)))).toFixed(2)),
      observationCount: comps.length,
      confidence,
      sampleRegions: middleRegions,
    },
    {
      zone: "lower",
      relativeExtension: Number((lowerExt.length ? mean(lowerExt) : 0).toFixed(2)),
      frequency: Number((lowerCount / comps.length).toFixed(2)),
      consistency: Number((1 - Math.min(1, coefficientOfVariation(lowerExt))).toFixed(2)),
      observationCount: lowerCount,
      confidence: lowerCount >= 5 ? confidence : confidence * 0.5,
      sampleRegions: lowerRegions,
    },
  ];

  return {
    key,
    label,
    reliability: "conditionally_reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-zones",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: comps.length,
      regions: [...upperRegions.slice(0, 5), ...lowerRegions.slice(0, 5)],
    },
  };
}
