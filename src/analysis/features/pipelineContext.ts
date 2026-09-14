import type { ConnectedComponent, LineBand, WordSpan } from "@/utils/segmentation";
import type { GrayBuffer } from "@/utils/grayscale";
import type { ScanQualityReport } from "@/types";
import type { LineXHeightBand } from "./common";

export interface LineWordData {
  line: LineBand;
  words: WordSpan[];
  letterGapPx: number[];
  wordGapPx: number[];
}

export interface PipelineContext {
  canvasWidth: number;
  canvasHeight: number;
  gray: GrayBuffer;
  mask: Uint8Array;
  threshold: number;
  lines: LineBand[];
  components: ConnectedComponent[];
  plausibleComponents: ConnectedComponent[];
  componentsByLine: Map<number, ConnectedComponent[]>;
  xHeightBands: LineXHeightBand[];
  lineWordData: LineWordData[];
  scanQuality: ScanQualityReport;
  analyzeRegardlessOfQuality: boolean;
}

/** Reads the scan-quality readiness score (0-100) for a given feature key, defaulting to the overall score if unknown. */
export function featureReadability(ctx: PipelineContext, featureKey: string): number {
  const entry = ctx.scanQuality.featureReadiness.find((f) => f.featureKey === featureKey);
  if (!entry || entry.readability === null) return ctx.scanQuality.overallScore * 0.6;
  return entry.readability;
}
