export interface GrayBuffer {
  data: Float32Array; // luminance 0-255
  width: number;
  height: number;
}

/** ITU-R BT.601 luma. */
export function toGrayscale(imageData: ImageData): GrayBuffer {
  const { data, width, height } = imageData;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    out[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return { data: out, width, height };
}

export function grayAt(buf: GrayBuffer, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= buf.width || y >= buf.height) return 255;
  return buf.data[y * buf.width + x];
}

export function histogram(buf: GrayBuffer): number[] {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < buf.data.length; i += 1) {
    hist[Math.round(buf.data[i])] += 1;
  }
  return hist;
}

/** Otsu's method: finds the threshold that best separates a bimodal histogram. */
export function otsuThreshold(buf: GrayBuffer): number {
  const hist = histogram(buf);
  const total = buf.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t += 1) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) ** 2;
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Binarizes to an ink mask (1 = ink, 0 = background). Assumes typical scanned
 * handwriting: dark ink on a lighter background. Polarity is auto-checked by
 * ensuring ink pixels remain the minority class (documents/paper backgrounds
 * dominate pixel count in a normal scan).
 */
export function binarize(buf: GrayBuffer, threshold: number): Uint8Array {
  const mask = new Uint8Array(buf.data.length);
  let inkCount = 0;
  for (let i = 0; i < buf.data.length; i += 1) {
    const isDark = buf.data[i] < threshold;
    mask[i] = isDark ? 1 : 0;
    if (isDark) inkCount += 1;
  }
  if (inkCount > mask.length / 2) {
    // Polarity looked inverted (background darker than threshold) - flip.
    for (let i = 0; i < mask.length; i += 1) mask[i] = mask[i] ? 0 : 1;
  }
  return mask;
}
