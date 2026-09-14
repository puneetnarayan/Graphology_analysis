import type { ReadabilityClass } from "@/types";

/** Score (0-100) → classification bands used throughout the quality engine and UI. */
export const READABILITY_BANDS: { min: number; classification: ReadabilityClass }[] = [
  { min: 90, classification: "excellent" },
  { min: 75, classification: "good" },
  { min: 60, classification: "usable" },
  { min: 40, classification: "limited" },
  { min: 20, classification: "poor" },
  { min: 0, classification: "unusable" },
];

export function classifyReadability(score: number): ReadabilityClass {
  for (const band of READABILITY_BANDS) {
    if (score >= band.min) return band.classification;
  }
  return "unusable";
}

/** Weights for combining quality component scores into one tile/overall score. Must sum to 1. */
export const QUALITY_COMPONENT_WEIGHTS = {
  resolution: 0.1,
  sharpness: 0.18,
  contrast: 0.14,
  foregroundSeparation: 0.14,
  strokeContinuity: 0.12,
  noise: 0.1,
  illuminationUniformity: 0.08,
  skew: 0.06,
  coverage: 0.08,
  inkDensity: 0.1,
};

export const QUALITY_GRID = {
  MIN_COLS: 3,
  MAX_COLS: 6,
  MIN_ROWS: 2,
  MAX_ROWS: 5,
  TARGET_TILE_PX: 180,
};

/** Minimum tile readability for a feature to be considered reliably extractable from that tile. */
export const FEATURE_READABILITY_REQUIREMENT: Record<string, number> = {
  slant: 55,
  baseline: 50,
  size: 55,
  spacing: 55,
  margins: 45,
  zones: 55,
  pressure: 70,
  tBars: 65,
  iDots: 65,
  ovals: 60,
  legibility: 40,
  rhythm: 55,
  signature: 65,
};
