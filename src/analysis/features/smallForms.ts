import { I_DOT_THRESHOLDS, OVAL_THRESHOLDS, T_BAR_THRESHOLDS } from "@/config/thresholds";
import { median, mean, coefficientOfVariation, clamp } from "@/utils/stats";
import type {
  FeatureModuleResult,
  IDotMeasurement,
  OvalMeasurement,
  TBarMeasurement,
} from "@/types";
import type { ConnectedComponent } from "@/utils/segmentation";
import { featureReadability, type PipelineContext } from "./pipelineContext";

function componentDims(c: ConnectedComponent) {
  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;
  return { w, h, cx: (c.minX + c.maxX) / 2, cy: (c.minY + c.maxY) / 2 };
}

/**
 * T-bar, i-dot and oval detection below are gated on the letter-agnostic
 * shape classifier (shapeClassifier.ts), which uses genuine topology (hole
 * detection) rather than bounding-box heuristics alone. This tightens
 * precision — e.g. a t-bar candidate must pair with a loop-free ascender
 * stem, so a stray horizontal stroke near a looped ascender ("b", "l" with a
 * serif loop) is correctly excluded — but it is still not per-letter OCR:
 * these are shape buckets, not confirmed letter identities.
 */
export function extractTBars(ctx: PipelineContext): FeatureModuleResult<TBarMeasurement> {
  const key = "tBars";
  const label = "T-Bars";
  const bandByLine = new Map(ctx.xHeightBands.map((b) => [b.lineIndex, b]));
  const results: { heightRatio: number; lengthRatio: number }[] = [];

  for (const [lineIdx, comps] of ctx.componentsByLine) {
    const band = bandByLine.get(lineIdx);
    if (!band) continue;
    const stems = comps.filter((c) => ctx.componentShapes.get(c.id)?.bucket === "ascender_stem");
    const bars = comps.filter((c) => ctx.componentShapes.get(c.id)?.bucket === "crossbar_candidate");
    for (const bar of bars) {
      const { w, cx, cy } = componentDims(bar);
      const stem = stems.find((s) => {
        const sDims = componentDims(s);
        return Math.abs(sDims.cx - cx) < w * 1.4 && s.minY < bar.minY && s.maxY > band.bottom;
      });
      if (!stem) continue;
      const heightRatio = (band.top - cy) / band.height;
      const lengthRatio = w / (median(comps.map((cc) => cc.maxX - cc.minX + 1)) || 1);
      results.push({ heightRatio, lengthRatio });
    }
  }

  if (results.length === 0) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: "No t-bar crossings could be confidently isolated in this sample.",
    };
  }

  const reliableCount = results.length;
  const readability = featureReadability(ctx, key) / 100;
  const confidence = clamp(
    0.2 + readability * 0.3 + Math.min(0.25, results.length / 30),
    0.05,
    results.length >= T_BAR_THRESHOLDS.MIN_RELIABLE_COUNT ? 0.75 : 0.35,
  );

  const measurement: TBarMeasurement = {
    count: results.length,
    reliableCount,
    meanHeightRatio: Number(mean(results.map((r) => r.heightRatio)).toFixed(2)),
    meanLengthRatio: Number(mean(results.map((r) => r.lengthRatio)).toFixed(2)),
    directionVariability: Number(coefficientOfVariation(results.map((r) => r.heightRatio)).toFixed(2)),
    confidence,
  };

  const available = results.length >= T_BAR_THRESHOLDS.MIN_RELIABLE_COUNT;

  return {
    key,
    label,
    reliability: "experimental",
    available,
    unavailableReason: available
      ? undefined
      : `Insufficient evidence: only ${results.length} t-bar crossings detected (minimum ${T_BAR_THRESHOLDS.MIN_RELIABLE_COUNT} required for interpretation).`,
    measurement,
    observation: available
      ? { id: "obs-tbars", value: measurement, confidence, source: "automatic", sampleCount: results.length }
      : undefined,
  };
}

export function extractIDots(ctx: PipelineContext): FeatureModuleResult<IDotMeasurement> {
  const key = "iDots";
  const label = "I-Dots";
  const bandByLine = new Map(ctx.xHeightBands.map((b) => [b.lineIndex, b]));
  const results: { vOffset: number; hOffset: number; circular: boolean }[] = [];

  for (const [lineIdx, comps] of ctx.componentsByLine) {
    const band = bandByLine.get(lineIdx);
    if (!band) continue;
    const dots = comps.filter((c) => ctx.componentShapes.get(c.id)?.bucket === "dot");
    // A genuine i/j stem is short relative to x-height — a full ascender
    // (l, t, h, k, b...) is not the stem a dot belongs to.
    const stems = comps.filter((c) => {
      const info = ctx.componentShapes.get(c.id);
      if (!info) return false;
      const isStemShaped = info.bucket === "ascender_stem" || info.bucket === "x_height_narrow_stem";
      return isStemShaped && info.heightToXHeightRatio <= 1.4;
    });

    for (const dot of dots) {
      const { w, cx } = componentDims(dot);
      const stem = stems.find((s) => {
        const sDims = componentDims(s);
        return Math.abs(sDims.cx - cx) < Math.max(6, w * 1.6) && s.minY > dot.maxY - 2 && s.maxY >= band.top;
      });
      if (!stem) continue;
      const sDims = componentDims(stem);
      const aspect = w / (dot.maxY - dot.minY + 1);
      results.push({
        vOffset: (stem.minY - dot.maxY) / band.height,
        hOffset: (cx - sDims.cx) / (median(comps.map((cc) => cc.maxX - cc.minX + 1)) || 1),
        circular: aspect > 0.65 && aspect < 1.5,
      });
    }
  }

  const available = results.length >= I_DOT_THRESHOLDS.MIN_RELIABLE_COUNT;
  if (results.length === 0) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: "No i/j dots could be confidently isolated in this sample.",
    };
  }

  const readability = featureReadability(ctx, key) / 100;
  const confidence = clamp(0.2 + readability * 0.3 + Math.min(0.25, results.length / 25), 0.05, available ? 0.7 : 0.3);

  const measurement: IDotMeasurement = {
    count: results.length,
    reliableCount: results.length,
    meanVerticalOffsetRatio: Number(mean(results.map((r) => r.vOffset)).toFixed(2)),
    meanHorizontalOffsetRatio: Number(mean(results.map((r) => r.hOffset)).toFixed(2)),
    circularFraction: Number((results.filter((r) => r.circular).length / results.length).toFixed(2)),
    confidence,
  };

  return {
    key,
    label,
    reliability: "experimental",
    available,
    unavailableReason: available
      ? undefined
      : `Insufficient evidence: only ${results.length} i-dots detected (minimum ${I_DOT_THRESHOLDS.MIN_RELIABLE_COUNT} required).`,
    measurement,
    observation: available
      ? { id: "obs-idots", value: measurement, confidence, source: "automatic", sampleCount: results.length }
      : undefined,
  };
}

export function extractOvals(ctx: PipelineContext): FeatureModuleResult<OvalMeasurement> {
  const key = "ovals";
  const label = "Ovals";
  const results: { compression: number; open: boolean }[] = [];

  for (const c of ctx.plausibleComponents) {
    const info = ctx.componentShapes.get(c.id);
    if (!info) continue;
    if (info.bucket !== "x_height_closed_loop" && info.bucket !== "x_height_open_round") continue;
    const { w, h } = componentDims(c);
    const compression = 1 - Math.min(w, h) / Math.max(w, h);
    results.push({ compression, open: info.bucket === "x_height_open_round" });
  }

  const available = results.length >= OVAL_THRESHOLDS.MIN_RELIABLE_COUNT;
  if (results.length === 0) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: "No oval-letter forms (a, o, e, etc.) could be confidently isolated.",
    };
  }

  const readability = featureReadability(ctx, key) / 100;
  const confidence = clamp(0.2 + readability * 0.3 + Math.min(0.25, results.length / 30), 0.05, available ? 0.65 : 0.25);

  const measurement: OvalMeasurement = {
    count: results.length,
    reliableCount: results.length,
    meanCompression: Number(mean(results.map((r) => r.compression)).toFixed(2)),
    openFraction: Number((results.filter((r) => r.open).length / results.length).toFixed(2)),
    confidence,
  };

  return {
    key,
    label,
    reliability: "experimental",
    available,
    unavailableReason: available
      ? undefined
      : `Insufficient evidence: only ${results.length} oval forms detected (minimum ${OVAL_THRESHOLDS.MIN_RELIABLE_COUNT} required).`,
    measurement,
    observation: available
      ? { id: "obs-ovals", value: measurement, confidence, source: "automatic", sampleCount: results.length }
      : undefined,
  };
}
