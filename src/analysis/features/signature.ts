import { SIGNATURE_THRESHOLDS } from "@/config/thresholds";
import { median } from "@/utils/stats";
import type { FeatureModuleResult, SignatureMeasurement } from "@/types";
import { type PipelineContext } from "./pipelineContext";

/**
 * Best-effort automatic signature candidate: the last writing line, if it is
 * notably shorter than the body text lines and sits in the lower portion of
 * the page. This heuristic is deliberately conservative — per spec §22, when
 * automatic detection is uncertain the user should manually confirm/select
 * the signature region via the Signature tab.
 */
export function extractSignature(ctx: PipelineContext): FeatureModuleResult<SignatureMeasurement> {
  const key = "signature";
  const label = "Signature";

  if (ctx.lines.length < 2) {
    return {
      key,
      label,
      reliability: "experimental",
      available: true,
      measurement: {
        detected: false,
        region: undefined,
        sizeRatioToBody: null,
        legibility: null,
        hasUnderline: null,
        hasStrikeThrough: null,
        slantDeltaDegrees: null,
        confidence: 0,
      },
    };
  }

  const bodyLines = ctx.lines.slice(0, -1);
  const lastLine = ctx.lines[ctx.lines.length - 1];
  const bodyComps = ctx.plausibleComponents.filter((c) => bodyLines.some((l) => l.index === c.lineIndex));
  const lastComps = ctx.plausibleComponents.filter((c) => c.lineIndex === lastLine.index);

  if (bodyComps.length < 10 || lastComps.length < 2) {
    return {
      key,
      label,
      reliability: "experimental",
      available: true,
      measurement: {
        detected: false,
        sizeRatioToBody: null,
        legibility: null,
        hasUnderline: null,
        hasStrikeThrough: null,
        slantDeltaDegrees: null,
        confidence: 0,
      },
    };
  }

  const bodyLineWidths = bodyLines.map((line) => {
    const comps = ctx.plausibleComponents.filter((c) => c.lineIndex === line.index);
    if (comps.length === 0) return 0;
    return Math.max(...comps.map((c) => c.maxX)) - Math.min(...comps.map((c) => c.minX));
  });
  const medianBodyWidth = median(bodyLineWidths.filter((w) => w > 0)) || 1;
  const lastLineWidth = Math.max(...lastComps.map((c) => c.maxX)) - Math.min(...lastComps.map((c) => c.minX));
  const isInLowerPage = lastLine.y0 > ctx.canvasHeight * 0.55;
  const isShorter = lastLineWidth < medianBodyWidth * 0.75;

  const bodyHeight = median(bodyComps.map((c) => c.maxY - c.minY + 1)) || 1;
  const lastHeight = median(lastComps.map((c) => c.maxY - c.minY + 1)) || 1;

  const detected = isInLowerPage && isShorter;
  const confidence = detected ? SIGNATURE_THRESHOLDS.MIN_CONFIDENCE_FOR_FINDINGS : 0.15;

  const measurement: SignatureMeasurement = {
    detected,
    region: detected
      ? {
          x: Math.min(...lastComps.map((c) => c.minX)) / ctx.canvasWidth,
          y: lastLine.y0 / ctx.canvasHeight,
          width: lastLineWidth / ctx.canvasWidth,
          height: Math.max(1, lastLine.y1 - lastLine.y0) / ctx.canvasHeight,
        }
      : undefined,
    sizeRatioToBody: detected ? Number((lastHeight / bodyHeight).toFixed(2)) : null,
    legibility: null,
    hasUnderline: null,
    hasStrikeThrough: null,
    slantDeltaDegrees: null,
    confidence,
  };

  return {
    key,
    label,
    reliability: "experimental",
    available: true,
    unavailableReason: detected
      ? undefined
      : "Automatic signature detection was not confident. Use the Signature tab to manually select the signature region.",
    measurement,
    observation: {
      id: "obs-signature",
      value: measurement,
      confidence,
      source: "automatic",
    },
  };
}
