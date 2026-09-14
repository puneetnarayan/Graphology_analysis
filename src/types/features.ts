import type { DetectorReliability, ImageRegion, Observation } from "./core";

/** Discrete classification enums used across feature modules. */
export type SlantClass =
  | "strong_left"
  | "moderate_left"
  | "vertical"
  | "moderate_right"
  | "strong_right"
  | "variable";

export type BaselineClass = "rising" | "level" | "falling" | "wavy_variable";

export type SpacingClass =
  | "very_narrow"
  | "narrow"
  | "moderate"
  | "wide"
  | "very_wide"
  | "variable";

export type PressureClass = "light" | "light_medium" | "medium" | "medium_heavy" | "heavy";

export interface SlantMeasurement {
  meanDegrees: number;
  medianDegrees: number;
  stdDevDegrees: number;
  classification: SlantClass;
  sampleCount: number;
  confidence: number;
}

export interface BaselineMeasurement {
  meanAngleDegrees: number;
  curvature: number;
  classification: BaselineClass;
  lineCount: number;
  variability: number;
  confidence: number;
}

export interface SizeMeasurement {
  meanMiddleZoneHeightPx: number;
  upperZoneRatio: number;
  lowerZoneRatio: number;
  widthHeightRatio: number;
  variationCoefficient: number;
  confidence: number;
}

export interface SpacingMeasurement {
  letterSpacingRatio: number; // relative to median letter width
  wordSpacingRatio: number; // relative to median letter width
  lineSpacingRatio: number; // relative to median middle-zone height
  letterClass: SpacingClass;
  wordClass: SpacingClass;
  lineClass: SpacingClass;
  wordSampleCount: number;
  confidence: number;
}

export interface MarginMeasurement {
  leftRatio: number;
  rightRatio: number;
  topRatio: number;
  bottomRatio: number;
  consistency: number;
  confidence: number;
}

export interface ZoneMeasurement {
  zone: "upper" | "middle" | "lower";
  relativeExtension: number;
  frequency: number;
  consistency: number;
  observationCount: number;
  confidence: number;
  /** A handful of representative component regions for this specific zone, for evidence traceability. */
  sampleRegions?: ImageRegion[];
}

export interface PressureProxyMeasurement {
  estimated: PressureClass;
  confidence: number;
  strokeDarkness: number; // 0-1
  strokeDensity: number; // 0-1
  strokeWidthConsistency: number; // 0-1
  suitabilityWarning?: string;
}

export interface TBarMeasurement {
  count: number;
  reliableCount: number;
  meanHeightRatio: number; // relative to middle-zone height, -1..1 (below..above)
  meanLengthRatio: number;
  directionVariability: number;
  confidence: number;
}

export interface IDotMeasurement {
  count: number;
  reliableCount: number;
  meanVerticalOffsetRatio: number;
  meanHorizontalOffsetRatio: number;
  circularFraction: number;
  confidence: number;
}

export interface OvalMeasurement {
  count: number;
  reliableCount: number;
  meanCompression: number; // 0 (round) - 1 (flat)
  openFraction: number;
  confidence: number;
}

export interface LegibilityMeasurement {
  score: number; // 0-100
  consistency: number;
  confidence: number;
}

export interface RhythmMeasurement {
  strokeContinuity: number; // 0-1
  sizeVariability: number; // 0-1, lower = steadier rhythm
  spacingVariability: number; // 0-1
  confidence: number;
}

export interface SignatureMeasurement {
  detected: boolean;
  region?: { x: number; y: number; width: number; height: number };
  sizeRatioToBody: number | null;
  legibility: number | null;
  hasUnderline: boolean | null;
  hasStrikeThrough: boolean | null;
  slantDeltaDegrees: number | null;
  confidence: number;
}

export interface ShapeBucketCount {
  bucket: string;
  label: string;
  count: number;
  fraction: number;
}

/**
 * Alphabet-level shape distribution: a letter-agnostic census of the
 * geometric buckets (loop presence, ascender/descender extension, aspect
 * ratio) observed across the sample's components. This is NOT per-letter
 * (a/o/e/...) identification — that requires OCR — but it surfaces the same
 * underlying graphological signals (loop prevalence, stem precision,
 * crossbar/dot candidates) in aggregate, and feeds the rule engine.
 */
export interface ShapeDistributionMeasurement {
  totalClassified: number;
  buckets: ShapeBucketCount[];
  loopFraction: number;
  narrowStemFraction: number;
  dotCandidateCount: number;
  crossbarCandidateCount: number;
  confidence: number;
}

/** A named feature module's overall analysis status. */
export interface FeatureModuleResult<TMeasurement> {
  key: string;
  label: string;
  reliability: DetectorReliability;
  available: boolean;
  unavailableReason?: string;
  measurement?: TMeasurement;
  observation?: Observation<TMeasurement>;
}

export interface AllFeatureResults {
  slant: FeatureModuleResult<SlantMeasurement>;
  baseline: FeatureModuleResult<BaselineMeasurement>;
  size: FeatureModuleResult<SizeMeasurement>;
  spacing: FeatureModuleResult<SpacingMeasurement>;
  margins: FeatureModuleResult<MarginMeasurement>;
  zones: FeatureModuleResult<ZoneMeasurement[]>;
  pressure: FeatureModuleResult<PressureProxyMeasurement>;
  tBars: FeatureModuleResult<TBarMeasurement>;
  iDots: FeatureModuleResult<IDotMeasurement>;
  ovals: FeatureModuleResult<OvalMeasurement>;
  legibility: FeatureModuleResult<LegibilityMeasurement>;
  rhythm: FeatureModuleResult<RhythmMeasurement>;
  signature: FeatureModuleResult<SignatureMeasurement>;
  letterShapes: FeatureModuleResult<ShapeDistributionMeasurement>;
}
