import type { ConnectedComponent, LineBand } from "@/utils/segmentation";
import { median, mean, stdDev } from "@/utils/stats";
import type { ImageRegion } from "@/types";

/** Filters out components too small to be strokes (noise specks) or implausibly huge (merged words / scan artifacts). */
export function plausibleLetterComponents(
  components: ConnectedComponent[],
  canvasWidth: number,
  canvasHeight: number,
): ConnectedComponent[] {
  const heights = components.map((c) => c.maxY - c.minY + 1);
  const medianHeight = median(heights) || 1;
  return components.filter((c) => {
    const h = c.maxY - c.minY + 1;
    const w = c.maxX - c.minX + 1;
    const area = c.area;
    if (area < 4) return false; // noise speck
    if (h > medianHeight * 6) return false; // likely a scan artifact/line
    if (w > canvasWidth * 0.5) return false; // spans half the page - not a single letter/word
    if (h > canvasHeight * 0.5) return false;
    return true;
  });
}

export interface LineXHeightBand {
  lineIndex: number;
  top: number;
  bottom: number;
  height: number;
}

/**
 * Estimates each line's x-height ("middle zone") band as the interquartile
 * vertical range of its plausible letter components. This is an
 * approximation: it assumes most letters in a line are x-height letters,
 * which holds for ordinary prose but can be skewed by very ascender/descender
 * heavy samples.
 */
export function estimateXHeightBands(
  lines: LineBand[],
  componentsByLine: Map<number, ConnectedComponent[]>,
): LineXHeightBand[] {
  const bands: LineXHeightBand[] = [];
  for (const line of lines) {
    const comps = componentsByLine.get(line.index) ?? [];
    if (comps.length < 3) {
      bands.push({ lineIndex: line.index, top: line.y0, bottom: line.y1, height: line.y1 - line.y0 });
      continue;
    }
    const tops = comps.map((c) => c.minY).sort((a, b) => a - b);
    const bottoms = comps.map((c) => c.maxY).sort((a, b) => a - b);
    const top = tops[Math.floor(tops.length * 0.35)];
    const bottom = bottoms[Math.floor(bottoms.length * 0.65)];
    bands.push({ lineIndex: line.index, top, bottom, height: Math.max(1, bottom - top) });
  }
  return bands;
}

export function componentsByLineMap(components: ConnectedComponent[]): Map<number, ConnectedComponent[]> {
  const map = new Map<number, ConnectedComponent[]>();
  for (const c of components) {
    if (c.lineIndex < 0) continue;
    if (!map.has(c.lineIndex)) map.set(c.lineIndex, []);
    map.get(c.lineIndex)!.push(c);
  }
  return map;
}

export function medianCharWidth(components: ConnectedComponent[]): number {
  const widths = components.map((c) => c.maxX - c.minX + 1);
  return median(widths) || 1;
}

export function componentRegion(
  c: ConnectedComponent,
  canvasWidth: number,
  canvasHeight: number,
  label?: string,
): ImageRegion {
  return {
    x: c.minX / canvasWidth,
    y: c.minY / canvasHeight,
    width: Math.max(1, c.maxX - c.minX) / canvasWidth,
    height: Math.max(1, c.maxY - c.minY) / canvasHeight,
    label,
  };
}

export function lineRegion(line: LineBand, canvasWidth: number, canvasHeight: number, label?: string): ImageRegion {
  return {
    x: 0,
    y: line.y0 / canvasHeight,
    width: 1,
    height: Math.max(1, line.y1 - line.y0) / canvasHeight,
    label,
  };
}

export { mean, median, stdDev };
