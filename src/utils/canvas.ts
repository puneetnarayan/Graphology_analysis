import { ANALYSIS_SETTINGS } from "@/config/analysisSettings";

/** Loads a File/Blob into an HTMLImageElement. DOM-only (main thread). */
export function loadImageElement(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image. The file may be corrupt or an unsupported format."));
    };
    img.src = url;
  });
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable in this browser.");
  return ctx;
}

export function imageElementToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = createCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = get2dContext(canvas);
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Produces a downscaled copy suitable for analysis (spec §49: analyze at an appropriate resolution). */
export function toAnalysisCanvas(
  source: HTMLCanvasElement,
  maxDim = ANALYSIS_SETTINGS.MAX_ANALYSIS_DIMENSION_PX,
): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  if (scale >= 1) return source;
  const canvas = createCanvas(source.width * scale, source.height * scale);
  const ctx = get2dContext(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  get2dContext(canvas).drawImage(source, 0, 0);
  return canvas;
}
