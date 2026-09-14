export const ANALYSIS_SETTINGS = {
  /** downscale factor cap for analysis-resolution processing (spec §49) */
  MAX_ANALYSIS_DIMENSION_PX: 1600,
  /** binarization sample used by segmentation, distinct from user-facing threshold control */
  AUTO_THRESHOLD_SAMPLE_STEP: 4,
  MIN_INK_PIXELS_FOR_ANALYSIS: 400,
  DEFAULT_ANALYZE_REGARDLESS_OF_QUALITY: true,
};

export const CONFIDENCE_LABELS = {
  labelFor(confidence: number): string {
    if (confidence >= 0.75) return "High";
    if (confidence >= 0.5) return "Moderate";
    if (confidence >= 0.3) return "Low";
    return "Very Low";
  },
};
