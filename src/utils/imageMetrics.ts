import type { GrayBuffer } from "./grayscale";
import { grayAt } from "./grayscale";
import { stdDev, clamp } from "./stats";

/** Laplacian-based focus/sharpness measure. Higher variance = sharper edges. */
export function laplacianVariance(buf: GrayBuffer): number {
  const { width, height } = buf;
  const responses: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const center = grayAt(buf, x, y);
      const lap =
        grayAt(buf, x - 1, y) +
        grayAt(buf, x + 1, y) +
        grayAt(buf, x, y - 1) +
        grayAt(buf, x, y + 1) -
        4 * center;
      responses.push(lap);
    }
  }
  return stdDev(responses) ** 2;
}

/** Global RMS contrast, 0-1. */
export function rmsContrast(buf: GrayBuffer): number {
  const normalized = Array.from(buf.data, (v) => v / 255);
  return clamp(stdDev(normalized) * 2.9, 0, 1); // scaled so typical scans land in a useful range
}

/** Noise estimate via high-frequency energy in flat-ish regions (simplified). */
export function noiseEstimate(buf: GrayBuffer): number {
  const { width, height } = buf;
  const diffs: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 300));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width - 1; x += step) {
      diffs.push(Math.abs(grayAt(buf, x, y) - grayAt(buf, x + 1, y)));
    }
  }
  // Median absolute difference is a robust proxy for sensor/compression noise
  // once genuine strokes (large, structured differences) are excluded via a
  // trimmed mean.
  diffs.sort((a, b) => a - b);
  const trimmed = diffs.slice(0, Math.floor(diffs.length * 0.6));
  const avg = trimmed.reduce((a, b) => a + b, 0) / Math.max(1, trimmed.length);
  return clamp(avg / 12, 0, 1);
}

/** Illumination uniformity: compares mean brightness across a coarse grid; 1 = perfectly even. */
export function illuminationUniformity(buf: GrayBuffer): number {
  const { width, height, data } = buf;
  const cellsX = 4;
  const cellsY = 4;
  const means: number[] = [];
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      let sum = 0;
      let count = 0;
      const x0 = Math.floor((cx / cellsX) * width);
      const x1 = Math.floor(((cx + 1) / cellsX) * width);
      const y0 = Math.floor((cy / cellsY) * height);
      const y1 = Math.floor(((cy + 1) / cellsY) * height);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          sum += data[y * width + x];
          count += 1;
        }
      }
      if (count > 0) means.push(sum / count);
    }
  }
  const spread = stdDev(means);
  return clamp(1 - spread / 60, 0, 1);
}

/** Fraction of pixels at or near 0/255 (clipping). */
export function clippingFraction(buf: GrayBuffer): number {
  let clipped = 0;
  for (let i = 0; i < buf.data.length; i += 1) {
    if (buf.data[i] <= 3 || buf.data[i] >= 252) clipped += 1;
  }
  return clipped / buf.data.length;
}
