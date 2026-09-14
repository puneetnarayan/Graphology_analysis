import { addPoint, emptyMoments, linearRegression, radToDeg, type MomentAccumulator } from "./geometry";

export interface LineBand {
  index: number;
  y0: number;
  y1: number;
}

export interface WordSpan {
  lineIndex: number;
  x0: number;
  x1: number;
}

export interface ConnectedComponent {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  moments: MomentAccumulator;
  lineIndex: number;
}

/** Row-wise ink pixel counts. */
export function rowInkCounts(mask: Uint8Array, width: number, height: number): Uint32Array {
  const counts = new Uint32Array(height);
  for (let y = 0; y < height; y += 1) {
    let c = 0;
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) c += mask[rowStart + x];
    counts[y] = c;
  }
  return counts;
}

/** Column-wise ink pixel counts restricted to a row range [y0, y1). */
export function colInkCounts(
  mask: Uint8Array,
  width: number,
  y0: number,
  y1: number,
): Uint32Array {
  const counts = new Uint32Array(width);
  for (let y = y0; y < y1; y += 1) {
    const rowStart = y * width;
    for (let x = 0; x < width; x += 1) counts[x] += mask[rowStart + x];
  }
  return counts;
}

/**
 * Detects writing-line bands via the horizontal (row) ink-density projection
 * profile: bands of rows with density above a noise floor, separated by low
 * density gaps, are individual text lines.
 */
export function detectLines(mask: Uint8Array, width: number, height: number): LineBand[] {
  const counts = rowInkCounts(mask, width, height);
  const maxCount = Math.max(1, ...Array.from(counts));
  const threshold = Math.max(1, maxCount * 0.02);
  const minGapRows = Math.max(2, Math.round(height * 0.006));
  const minLineRows = Math.max(3, Math.round(height * 0.01));

  const bands: LineBand[] = [];
  let inBand = false;
  let start = 0;
  let gap = 0;
  for (let y = 0; y < height; y += 1) {
    const active = counts[y] > threshold;
    if (active) {
      if (!inBand) {
        inBand = true;
        start = y;
      }
      gap = 0;
    } else if (inBand) {
      gap += 1;
      if (gap >= minGapRows) {
        const end = y - gap;
        if (end - start >= minLineRows) bands.push({ index: bands.length, y0: start, y1: end });
        inBand = false;
      }
    }
  }
  if (inBand) {
    const end = height - gap;
    if (end - start >= minLineRows) bands.push({ index: bands.length, y0: start, y1: end });
  }
  return bands.map((b, i) => ({ ...b, index: i }));
}

/**
 * Within a single line band, segments columns into "runs" of ink separated
 * by gaps, then classifies gaps as intra-word (letter spacing) or
 * inter-word using the distribution of gap widths for that line.
 */
export function detectWordsInLine(
  mask: Uint8Array,
  width: number,
  line: LineBand,
): { words: WordSpan[]; letterGapPx: number[]; wordGapPx: number[] } {
  const counts = colInkCounts(mask, width, line.y0, line.y1);
  const runs: { x0: number; x1: number }[] = [];
  let inRun = false;
  let start = 0;
  for (let x = 0; x < width; x += 1) {
    const active = counts[x] > 0;
    if (active && !inRun) {
      inRun = true;
      start = x;
    } else if (!active && inRun) {
      inRun = false;
      runs.push({ x0: start, x1: x });
    }
  }
  if (inRun) runs.push({ x0: start, x1: width });

  if (runs.length === 0) return { words: [], letterGapPx: [], wordGapPx: [] };

  const gaps = runs.slice(1).map((r, i) => r.x0 - runs[i].x1);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 0;
  // A gap notably larger than the local median letter gap is treated as a word boundary.
  const wordGapThreshold = Math.max(medianGap * 2.4, 6);

  const words: WordSpan[] = [];
  let wordStart = runs[0].x0;
  const letterGapPx: number[] = [];
  const wordGapPx: number[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const isLast = i === runs.length - 1;
    const gapAfter = isLast ? Infinity : gaps[i];
    if (!isLast && gapAfter < wordGapThreshold) {
      letterGapPx.push(gapAfter);
      continue;
    }
    words.push({ lineIndex: line.index, x0: wordStart, x1: runs[i].x1 });
    if (!isLast) {
      wordGapPx.push(gapAfter);
      wordStart = runs[i + 1].x0;
    }
  }
  return { words, letterGapPx, wordGapPx };
}

/**
 * Iterative 4-connectivity flood-fill labeling across the whole mask.
 * Returns bounding-box + moment statistics per component. Components are
 * assigned to the writing line whose band contains their centroid.
 */
export function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  lines: LineBand[],
  maxComponents = 20000,
): ConnectedComponent[] {
  const labeled = new Int32Array(mask.length).fill(-1);
  const components: ConnectedComponent[] = [];
  const stack = new Int32Array(width * height);

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || labeled[start] !== -1) continue;
    if (components.length >= maxComponents) break;

    let sp = 0;
    stack[sp] = start;
    sp += 1;
    labeled[start] = components.length;

    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;
    let area = 0;
    const moments = emptyMoments();

    while (sp > 0) {
      sp -= 1;
      const idx = stack[sp];
      const x = idx % width;
      const y = (idx - x) / width;
      area += 1;
      addPoint(moments, x, y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length) continue;
        // Prevent wraparound on row boundaries for horizontal neighbors.
        if ((n === idx - 1 || n === idx + 1) && Math.floor(n / width) !== y) continue;
        if (mask[n] === 1 && labeled[n] === -1) {
          labeled[n] = components.length;
          stack[sp] = n;
          sp += 1;
        }
      }
    }

    const centroidY = moments.sumY / area;
    const lineIndex = lines.findIndex((l) => centroidY >= l.y0 && centroidY < l.y1);
    components.push({
      id: components.length,
      minX,
      minY,
      maxX,
      maxY,
      area,
      moments,
      lineIndex: lineIndex === -1 ? -1 : lineIndex,
    });
  }
  return components;
}

/**
 * Estimates each line's baseline by finding, for a set of column bins, the
 * lowest ink row, then fitting a line through those points. Curvature is the
 * regression residual normalized by line height (spec §14).
 */
export function estimateBaseline(
  mask: Uint8Array,
  width: number,
  line: LineBand,
): { angleDegrees: number; curvature: number; points: { x: number; y: number }[] } {
  const bins = 14;
  const binWidth = width / bins;
  const points: { x: number; y: number }[] = [];
  for (let b = 0; b < bins; b += 1) {
    const x0 = Math.floor(b * binWidth);
    const x1 = Math.floor((b + 1) * binWidth);
    let bottomY = -1;
    for (let y = line.y1 - 1; y >= line.y0; y -= 1) {
      let found = false;
      const rowStart = y * width;
      for (let x = x0; x < x1; x += 1) {
        if (mask[rowStart + x] === 1) {
          found = true;
          break;
        }
      }
      if (found) {
        bottomY = y;
        break;
      }
    }
    if (bottomY >= 0) points.push({ x: (x0 + x1) / 2, y: bottomY });
  }
  if (points.length < 3) return { angleDegrees: 0, curvature: 0, points };
  const { slope, residualStdDev } = linearRegression(points);
  const lineHeight = Math.max(1, line.y1 - line.y0);
  return {
    angleDegrees: radToDeg(Math.atan(slope)),
    curvature: Math.min(1, residualStdDev / lineHeight),
    points,
  };
}

/**
 * Estimates document skew by searching a small angle range and finding the
 * rotation that maximizes the variance of the row-wise ink projection
 * profile (text lines produce sharp, high-variance peaks when level).
 * Operates on a subsampled point cloud for speed.
 */
export function estimateSkewAngle(mask: Uint8Array, width: number, height: number): number {
  const points: { x: number; y: number }[] = [];
  const step = Math.max(1, Math.floor((width * height) / 60000));
  for (let i = 0; i < mask.length; i += step) {
    if (mask[i] === 1) {
      const x = i % width;
      const y = (i - x) / width;
      points.push({ x, y });
    }
  }
  if (points.length < 50) return 0;

  const cx = width / 2;
  const cy = height / 2;
  let bestAngle = 0;
  let bestVariance = -Infinity;
  for (let deg = -10; deg <= 10; deg += 0.5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const bucketCount = 200;
    const buckets = new Float64Array(bucketCount);
    for (const p of points) {
      const rx = p.x - cx;
      const ry = p.y - cy;
      const ry2 = rx * sin + ry * cos;
      const bucket = Math.floor(((ry2 + height) / (2 * height)) * bucketCount);
      if (bucket >= 0 && bucket < bucketCount) buckets[bucket] += 1;
    }
    const m = buckets.reduce((a, b) => a + b, 0) / bucketCount;
    const variance = buckets.reduce((a, b) => a + (b - m) ** 2, 0) / bucketCount;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestAngle = deg;
    }
  }
  return bestAngle;
}
