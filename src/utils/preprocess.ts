import { createCanvas, get2dContext } from "./canvas";
import type { PreprocessingSettings } from "@/types";

/** Rotates a canvas by `degrees`, expanding the canvas to fit the rotated content. */
function rotateCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (degrees % 360 === 0) return source;
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const newWidth = Math.round(source.width * cos + source.height * sin);
  const newHeight = Math.round(source.width * sin + source.height * cos);
  const canvas = createCanvas(newWidth, newHeight);
  const ctx = get2dContext(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, newWidth, newHeight);
  ctx.translate(newWidth / 2, newHeight / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

/** `crop` fields are normalized 0-1 fractions of the (already rotated) canvas. */
function cropCanvas(
  source: HTMLCanvasElement,
  crop: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const x = Math.round(crop.x * source.width);
  const y = Math.round(crop.y * source.height);
  const w = Math.max(1, Math.round(crop.width * source.width));
  const h = Math.max(1, Math.round(crop.height * source.height));
  const canvas = createCanvas(w, h);
  get2dContext(canvas).drawImage(source, x, y, w, h, 0, 0, w, h);
  return canvas;
}

function boxBlur(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return imageData;
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const idx = (yy * width + xx) * 4;
          rSum += data[idx];
          gSum += data[idx + 1];
          bSum += data[idx + 2];
          count += 1;
        }
      }
      const idx = (y * width + x) * 4;
      out[idx] = rSum / count;
      out[idx + 1] = gSum / count;
      out[idx + 2] = bSum / count;
      out[idx + 3] = data[idx + 3];
    }
  }
  return new ImageData(out, width, height);
}

function applyPixelFilters(imageData: ImageData, settings: PreprocessingSettings): ImageData {
  const { data } = imageData;
  const brightness = settings.brightness * 1.5;
  const contrastFactor = (259 * (settings.contrast * 2.55 + 255)) / (255 * (259 - settings.contrast * 2.55));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (settings.grayscale) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray;
      g = gray;
      b = gray;
    }

    r = contrastFactor * (r - 128) + 128 + brightness;
    g = contrastFactor * (g - 128) + 128 + brightness;
    b = contrastFactor * (b - 128) + 128 + brightness;

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }
  return imageData;
}

function applySharpen(imageData: ImageData, amount: number): ImageData {
  if (amount <= 0) return imageData;
  const strength = amount / 100;
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        let k = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const idx = ((y + dy) * width + (x + dx)) * 4 + c;
            sum += src[idx] * kernel[k];
            k += 1;
          }
        }
        const idx = (y * width + x) * 4 + c;
        data[idx] = Math.min(255, Math.max(0, src[idx] * (1 - strength) + sum * strength));
      }
    }
  }
  return imageData;
}

/** Rough shading correction: divide by a heavily blurred copy to flatten uneven lighting. */
function applyBackgroundNormalization(canvas: HTMLCanvasElement): void {
  const ctx = get2dContext(canvas);
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const blurred = boxBlur(new ImageData(new Uint8ClampedArray(original.data), canvas.width, canvas.height), 15);
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < original.data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const bg = Math.max(1, blurred.data[i + c]);
      const corrected = (original.data[i + c] / bg) * 200;
      out.data[i + c] = Math.min(255, Math.max(0, corrected));
    }
    out.data[i + 3] = original.data[i + 3];
  }
  ctx.putImageData(out, 0, 0);
}

function applyThreshold(canvas: HTMLCanvasElement, threshold: number): void {
  const ctx = get2dContext(canvas);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = gray < threshold ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Applies the full non-destructive preprocessing pipeline to a source canvas
 * and returns a new canvas. The source is never mutated (spec §6).
 */
export function applyPreprocessing(
  source: HTMLCanvasElement,
  settings: PreprocessingSettings,
): HTMLCanvasElement {
  const totalRotation = settings.rotationDegrees + (settings.deskew ? settings.deskewAngleDegrees : 0);
  const rotated = rotateCanvas(source, totalRotation);
  let canvas: HTMLCanvasElement;
  if (settings.crop) {
    canvas = cropCanvas(rotated, settings.crop);
  } else {
    canvas = createCanvas(rotated.width, rotated.height);
    get2dContext(canvas).drawImage(rotated, 0, 0);
  }

  const ctx = get2dContext(canvas);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  imageData = applyPixelFilters(imageData, settings);
  if (settings.sharpen > 0) imageData = applySharpen(imageData, settings.sharpen);
  ctx.putImageData(imageData, 0, 0);

  if (settings.noiseReduction > 0) {
    const radius = Math.round((settings.noiseReduction / 100) * 3);
    const blurred = boxBlur(ctx.getImageData(0, 0, canvas.width, canvas.height), radius);
    ctx.putImageData(blurred, 0, 0);
  }

  if (settings.backgroundNormalize) {
    applyBackgroundNormalization(canvas);
  }

  if (settings.threshold !== null) {
    applyThreshold(canvas, settings.threshold);
  }

  return canvas;
}
