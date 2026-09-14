import type { RuleCategory } from "@/types";

export const FEATURE_TO_RULE_CATEGORY: Record<string, RuleCategory> = {
  slant: "slant",
  pressure: "pressure",
  baseline: "baseline",
  size: "size",
  spacing: "spacing",
  margins: "margins",
  zones: "zones",
  ovals: "ovals",
  tBars: "t-bars",
  iDots: "i-dots",
  legibility: "legibility",
  rhythm: "rhythm",
  signature: "signature",
  letterShapes: "letters",
};

const LABEL_OVERRIDES: Record<string, string> = {
  meanDegrees: "Mean",
  medianDegrees: "Median",
  stdDevDegrees: "Std. Deviation",
  sampleCount: "Sample Count",
  classification: "Classification",
  meanAngleDegrees: "Mean Angle",
  lineCount: "Lines Analyzed",
  meanMiddleZoneHeightPx: "Mean Middle-Zone Height (px)",
  upperZoneRatio: "Upper-Zone Ratio",
  lowerZoneRatio: "Lower-Zone Ratio",
  widthHeightRatio: "Width/Height Ratio",
  variationCoefficient: "Size Variation",
  letterSpacingRatio: "Letter Spacing Ratio",
  wordSpacingRatio: "Word Spacing Ratio",
  lineSpacingRatio: "Line Spacing Ratio",
  letterClass: "Letter Spacing",
  wordClass: "Word Spacing",
  lineClass: "Line Spacing",
  wordSampleCount: "Words Sampled",
  leftRatio: "Left Margin",
  rightRatio: "Right Margin",
  topRatio: "Top Margin",
  bottomRatio: "Bottom Margin",
  consistency: "Consistency",
  estimated: "Estimated Pressure",
  strokeDarkness: "Stroke Darkness",
  strokeDensity: "Stroke Density",
  strokeWidthConsistency: "Stroke Width Consistency",
  suitabilityWarning: "Suitability Warning",
  count: "Count",
  reliableCount: "Reliable Count",
  meanHeightRatio: "Mean Height Ratio",
  meanLengthRatio: "Mean Length Ratio",
  directionVariability: "Direction Variability",
  meanVerticalOffsetRatio: "Mean Vertical Offset",
  meanHorizontalOffsetRatio: "Mean Horizontal Offset",
  circularFraction: "Circular Fraction",
  meanCompression: "Mean Compression",
  openFraction: "Open Fraction",
  score: "Score",
  strokeContinuity: "Stroke Continuity",
  sizeVariability: "Size Variability",
  spacingVariability: "Spacing Variability",
  detected: "Detected",
  sizeRatioToBody: "Size Ratio to Body Text",
  legibility: "Legibility",
  hasUnderline: "Underline",
  hasStrikeThrough: "Strike-through",
  slantDeltaDegrees: "Slant Delta",
  confidence: "Confidence",
  totalClassified: "Components Classified",
  loopFraction: "Loop-Bearing Fraction",
  narrowStemFraction: "Narrow-Stem Fraction",
  dotCandidateCount: "Dot Candidates",
  crossbarCandidateCount: "Crossbar Candidates",
};

export function humanizeMeasurementKey(key: string): string {
  return LABEL_OVERRIDES[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export function formatMeasurementValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "confidence" && typeof value === "number") return `${Math.round(value * (value <= 1 ? 100 : 1))}%`;
  if (typeof value === "string") return value.replace(/_/g, " ");
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}
