import type { ConnectedComponent } from "@/utils/segmentation";
import { detectEnclosedHoles } from "@/utils/topology";
import type { LineXHeightBand } from "./common";

/**
 * Letter-agnostic shape buckets. These describe *geometry* (loop presence,
 * zone extension, aspect ratio) observed on a connected ink component — they
 * are deliberately NOT letter identities. A "dot" bucket does not assert the
 * component is an i-dot; it only says a tiny, roundish, loopless mark sits
 * above the x-height band. Pairing (e.g. dot + stem below it) happens in the
 * feature detectors that consume this classification. True per-letter
 * identification (a vs o vs e) requires OCR, which this engine does not yet
 * perform (see README).
 */
export type ShapeBucket =
  | "dot"
  | "crossbar_candidate"
  | "ascender_with_loop"
  | "ascender_stem"
  | "descender_with_loop"
  | "descender_stem"
  | "full_span"
  | "x_height_closed_loop"
  | "x_height_open_round"
  | "x_height_narrow_stem"
  | "other";

export const SHAPE_BUCKET_LABELS: Record<ShapeBucket, string> = {
  dot: "Dot mark (i/j-dot candidate)",
  crossbar_candidate: "Crossbar stroke (t-bar candidate)",
  ascender_with_loop: "Ascender with loop (b/l/h-like)",
  ascender_stem: "Ascender stem, no loop",
  descender_with_loop: "Descender with loop (g/y-like)",
  descender_stem: "Descender stem, no loop",
  full_span: "Full-height span (ascender + descender)",
  x_height_closed_loop: "X-height closed loop (a/o/e-like)",
  x_height_open_round: "X-height open round form",
  x_height_narrow_stem: "X-height narrow stem (i/r-like)",
  other: "Unclassified",
};

export interface ComponentShapeInfo {
  componentId: number;
  bucket: ShapeBucket;
  hasLoop: boolean;
  loopCount: number;
  hasAscender: boolean;
  hasDescender: boolean;
  aspectRatio: number;
  heightToXHeightRatio: number;
}

function classifyBucket(
  c: ConnectedComponent,
  band: LineXHeightBand,
  hasLoop: boolean,
): { bucket: ShapeBucket; hasAscender: boolean; hasDescender: boolean } {
  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;
  const aspectRatio = w / h;
  const xH = Math.max(1, band.height);
  const cy = (c.minY + c.maxY) / 2;
  const margin = xH * 0.12;

  const hasAscender = c.minY < band.top - margin;
  const hasDescender = c.maxY > band.bottom + margin;

  const isDotLike =
    c.area <= xH * xH * 0.14 && aspectRatio > 0.4 && aspectRatio < 2.5 && !hasLoop && c.maxY < band.top + xH * 0.2;
  if (isDotLike) return { bucket: "dot", hasAscender, hasDescender };

  const isCrossbarLike = aspectRatio >= 1.6 && h <= xH * 0.75 && cy < band.top + xH * 0.35 && !hasLoop;
  if (isCrossbarLike) return { bucket: "crossbar_candidate", hasAscender, hasDescender };

  if (hasAscender && hasDescender) return { bucket: "full_span", hasAscender, hasDescender };
  if (hasAscender && hasLoop) return { bucket: "ascender_with_loop", hasAscender, hasDescender };
  if (hasAscender) return { bucket: "ascender_stem", hasAscender, hasDescender };
  if (hasDescender && hasLoop) return { bucket: "descender_with_loop", hasAscender, hasDescender };
  if (hasDescender) return { bucket: "descender_stem", hasAscender, hasDescender };

  if (hasLoop && aspectRatio > 0.5 && aspectRatio < 1.8) return { bucket: "x_height_closed_loop", hasAscender, hasDescender };
  if (!hasLoop && aspectRatio > 0.5 && aspectRatio < 1.8 && h / xH > 0.6) {
    return { bucket: "x_height_open_round", hasAscender, hasDescender };
  }
  if (!hasLoop && aspectRatio <= 0.6) return { bucket: "x_height_narrow_stem", hasAscender, hasDescender };

  return { bucket: "other", hasAscender, hasDescender };
}

export function classifyComponentShapes(
  components: ConnectedComponent[],
  bandByLine: Map<number, LineXHeightBand>,
  mask: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
): Map<number, ComponentShapeInfo> {
  const result = new Map<number, ComponentShapeInfo>();
  for (const c of components) {
    const band = bandByLine.get(c.lineIndex);
    if (!band) continue;
    const holes = detectEnclosedHoles(mask, canvasWidth, canvasHeight, c.minX, c.minY, c.maxX, c.maxY);
    const hasLoop = holes.holeCount > 0;
    const { bucket, hasAscender, hasDescender } = classifyBucket(c, band, hasLoop);
    const w = c.maxX - c.minX + 1;
    const h = c.maxY - c.minY + 1;
    result.set(c.id, {
      componentId: c.id,
      bucket,
      hasLoop,
      loopCount: holes.holeCount,
      hasAscender,
      hasDescender,
      aspectRatio: w / h,
      heightToXHeightRatio: h / Math.max(1, band.height),
    });
  }
  return result;
}
