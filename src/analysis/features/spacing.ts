import { SPACING_THRESHOLDS } from "@/config/thresholds";
import { median } from "@/utils/stats";
import type { FeatureModuleResult, ImageRegion, SpacingClass, SpacingMeasurement } from "@/types";
import { medianCharWidth } from "./common";
import { featureReadability, type PipelineContext } from "./pipelineContext";

/** A handful of representative word bounding boxes, for evidence traceability. */
function sampleWordRegions(ctx: PipelineContext, limit = 10): ImageRegion[] {
  const regions: ImageRegion[] = [];
  for (const lw of ctx.lineWordData) {
    for (const w of lw.words) {
      if (regions.length >= limit) return regions;
      regions.push({
        x: w.x0 / ctx.canvasWidth,
        y: lw.line.y0 / ctx.canvasHeight,
        width: (w.x1 - w.x0) / ctx.canvasWidth,
        height: Math.max(1, lw.line.y1 - lw.line.y0) / ctx.canvasHeight,
        label: `Line ${lw.line.index + 1} word`,
      });
    }
  }
  return regions;
}

function classifyRatio(ratio: number, narrow: number, moderate: number, wide: number): SpacingClass {
  if (ratio < narrow * 0.5) return "very_narrow";
  if (ratio < narrow) return "narrow";
  if (ratio < moderate) return "moderate";
  if (ratio < wide) return "wide";
  return "very_wide";
}

export function extractSpacing(ctx: PipelineContext): FeatureModuleResult<SpacingMeasurement> {
  const key = "spacing";
  const label = "Spacing";

  const allWordGaps = ctx.lineWordData.flatMap((l) => l.wordGapPx);
  const allLetterGaps = ctx.lineWordData.flatMap((l) => l.letterGapPx);
  const wordCount = ctx.lineWordData.reduce((a, l) => a + l.words.length, 0);

  if (wordCount < SPACING_THRESHOLDS.MIN_WORD_SAMPLE) {
    return {
      key,
      label,
      reliability: "reliable",
      available: false,
      unavailableReason: `Insufficient evidence: only ${wordCount} words segmented (minimum ${SPACING_THRESHOLDS.MIN_WORD_SAMPLE} required).`,
    };
  }

  const charWidth = medianCharWidth(ctx.plausibleComponents);
  const letterRatio = allLetterGaps.length ? median(allLetterGaps) / charWidth : 0;
  const wordRatio = allWordGaps.length ? median(allWordGaps) / charWidth : 0;

  const lineGaps: number[] = [];
  const middleZoneHeight = median(ctx.xHeightBands.map((b) => b.height)) || 1;
  for (let i = 1; i < ctx.lines.length; i += 1) {
    lineGaps.push(ctx.lines[i].y0 - ctx.lines[i - 1].y1);
  }
  const lineRatio = lineGaps.length ? median(lineGaps) / middleZoneHeight : 0;

  const readability = featureReadability(ctx, key) / 100;
  const confidence = Math.min(0.93, 0.45 + readability * 0.4 + Math.min(0.1, wordCount / 150));

  const measurement: SpacingMeasurement = {
    letterSpacingRatio: Number(letterRatio.toFixed(2)),
    wordSpacingRatio: Number(wordRatio.toFixed(2)),
    lineSpacingRatio: Number(lineRatio.toFixed(2)),
    letterClass: classifyRatio(
      letterRatio,
      SPACING_THRESHOLDS.LETTER_NARROW,
      SPACING_THRESHOLDS.LETTER_MODERATE,
      SPACING_THRESHOLDS.LETTER_WIDE,
    ),
    wordClass: classifyRatio(
      wordRatio,
      SPACING_THRESHOLDS.WORD_NARROW,
      SPACING_THRESHOLDS.WORD_MODERATE,
      SPACING_THRESHOLDS.WORD_WIDE,
    ),
    lineClass: classifyRatio(
      lineRatio,
      SPACING_THRESHOLDS.LINE_NARROW,
      SPACING_THRESHOLDS.LINE_MODERATE,
      SPACING_THRESHOLDS.LINE_WIDE,
    ),
    wordSampleCount: wordCount,
    confidence,
  };

  return {
    key,
    label,
    reliability: "reliable",
    available: true,
    measurement,
    observation: {
      id: "obs-spacing",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: wordCount,
      regions: sampleWordRegions(ctx),
    },
  };
}
