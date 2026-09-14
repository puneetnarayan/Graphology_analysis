/**
 * Centralized calibration constants. Nothing in /analysis or /rules should
 * hard-code a magic number that belongs here (spec §43).
 *
 * These initial values are reasonable engineering defaults for a first
 * release; they are NOT derived from a validated psychometric study and
 * should be tuned against real calibration samples over time (spec §53
 * Phase 7).
 */

export const SLANT_THRESHOLDS = {
  /** degrees; positive = rightward lean */
  VERTICAL_BAND: 4,
  MODERATE_MAX: 14,
  // beyond MODERATE_MAX is "strong"
  /** stdDev above which the sample is classified "variable" rather than a directional slant */
  VARIABLE_STD_DEV: 13,
  MIN_SAMPLE_COUNT: 12,
};

export const BASELINE_THRESHOLDS = {
  LEVEL_BAND_DEGREES: 1.2,
  MIN_LINES: 3,
  WAVY_VARIABILITY: 0.35,
};

export const SIZE_THRESHOLDS = {
  SMALL_MAX_PX: 14,
  LARGE_MIN_PX: 30,
  HIGH_VARIATION_COEFFICIENT: 0.32,
};

export const SPACING_THRESHOLDS = {
  LETTER_VERY_NARROW: 0.25,
  LETTER_NARROW: 0.45,
  LETTER_MODERATE: 0.8,
  LETTER_WIDE: 1.2,
  WORD_NARROW: 1.0,
  WORD_MODERATE: 1.8,
  WORD_WIDE: 2.8,
  LINE_NARROW: 1.3,
  LINE_MODERATE: 2.0,
  LINE_WIDE: 2.8,
  MIN_WORD_SAMPLE: 8,
};

export const PRESSURE_THRESHOLDS = {
  MIN_IMAGE_QUALITY_FOR_INFERENCE: 45, // 0-100 scan quality composite
  LIGHT_MAX: 0.28,
  MEDIUM_MAX: 0.55,
  MEDIUM_HEAVY_MAX: 0.75,
  // above MEDIUM_HEAVY_MAX -> heavy
  COMPRESSION_ARTIFACT_PENALTY: 0.25,
};

export const T_BAR_THRESHOLDS = {
  MIN_RELIABLE_COUNT: 6,
  HIGH_PLACEMENT_RATIO: 0.55,
  LOW_PLACEMENT_RATIO: -0.15,
};

export const I_DOT_THRESHOLDS = {
  MIN_RELIABLE_COUNT: 6,
  HIGH_OFFSET_RATIO: 0.35,
};

export const OVAL_THRESHOLDS = {
  MIN_RELIABLE_COUNT: 6,
  HIGH_COMPRESSION: 0.45,
  OPEN_FRACTION_NOTABLE: 0.3,
};

export const ZONE_THRESHOLDS = {
  MIN_OBSERVATIONS: 10,
  DOMINANT_EXTENSION: 1.35,
};

export const LEGIBILITY_THRESHOLDS = {
  HIGH_MIN: 75,
  LOW_MAX: 40,
};

export const RHYTHM_THRESHOLDS = {
  HIGH_VARIABILITY: 0.4,
};

export const SIGNATURE_THRESHOLDS = {
  SIZE_DELTA_NOTABLE: 0.35, // fraction difference from body text height
  MIN_CONFIDENCE_FOR_FINDINGS: 0.4,
};

export const CONFIDENCE_THRESHOLDS = {
  /** below this, a rule should not fire at all regardless of other factors */
  MIN_RULE_ACTIVATION_CONFIDENCE: 0.3,
  /** minimum effective weight (rule_weight x confidence x sufficiency x quality) to count as "supporting evidence" */
  MIN_EFFECTIVE_WEIGHT: 0.08,
  HIGH_CONFIDENCE: 0.75,
  MODERATE_CONFIDENCE: 0.5,
};

export const SAMPLE_SUFFICIENCY = {
  /** returns 1.0 once observed count reaches `full` and scales linearly from 0 at `min` */
  scale(count: number, min: number, full: number): number {
    if (count <= 0) return 0;
    if (count >= full) return 1;
    if (count <= min) return count / min <= 1 ? Math.max(0, (count / min) * 0.4) : 0.4;
    return 0.4 + ((count - min) / (full - min)) * 0.6;
  },
};
