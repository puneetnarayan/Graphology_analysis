import { applyPreprocessing } from "./preprocess";
import { toAnalysisCanvas, get2dContext } from "./canvas";
import { assessScanQuality } from "@/analysis/quality/qualityEngine";
import type { PreprocessingSettings } from "@/types";

/** Smaller analysis resolution used during the search so each candidate scores fast. */
const SEARCH_RESOLUTION_PX = 700;

function scoreSettings(originalCanvas: HTMLCanvasElement, settings: PreprocessingSettings): number {
  const prepared = applyPreprocessing(originalCanvas, settings);
  const analysisCanvas = toAnalysisCanvas(prepared, SEARCH_RESOLUTION_PX);
  const imageData = get2dContext(analysisCanvas).getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
  return assessScanQuality(imageData).overallScore;
}

export interface AutoTuneResult {
  settings: PreprocessingSettings;
  /** Scan-quality score of the settings passed in, before any change. */
  baselineScore: number;
  /** Scan-quality score of the returned (tuned) settings. */
  tunedScore: number;
}

/**
 * Best-effort local search (coordinate ascent, one pass) over the Tone &
 * Clarity parameters — brightness, contrast, sharpen, noise reduction,
 * grayscale, background normalization — that maximizes the scan quality
 * composite score. Rotation, crop, deskew and threshold are left untouched;
 * those are geometry/binarization choices, not "tone".
 *
 * This is a local optimum over a coarse grid, not an exhaustive or globally
 * optimal search, and it maximizes scan *quality* (the input the analysis
 * confidence is most sensitive to) rather than re-running the full
 * feature-extraction + rule engine per candidate, which would be far too
 * slow to run synchronously in the UI.
 */
export function autoTuneToneForQuality(
  originalCanvas: HTMLCanvasElement,
  baseSettings: PreprocessingSettings,
): AutoTuneResult {
  let best = { ...baseSettings };
  const baselineScore = scoreSettings(originalCanvas, best);
  let bestScore = baselineScore;

  function tryValues<K extends keyof PreprocessingSettings>(key: K, values: PreprocessingSettings[K][]) {
    for (const value of values) {
      if (value === best[key]) continue;
      const candidate = { ...best, [key]: value };
      const score = scoreSettings(originalCanvas, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }

  tryValues("brightness", [-30, -15, 0, 15, 30]);
  tryValues("contrast", [0, 15, 30, 45]);
  tryValues("sharpen", [0, 20, 40]);
  tryValues("noiseReduction", [0, 20, 40]);
  tryValues("grayscale", [false, true]);
  tryValues("backgroundNormalize", [false, true]);

  return { settings: best, baselineScore, tunedScore: bestScore };
}
