/**
 * Core shared types for the graphology analysis engine.
 *
 * Design principle (see project spec §54, §55): every measurement carries an
 * explicit confidence and a reliability classification. Nothing here
 * fabricates precision — a feature that cannot be reliably extracted must be
 * represented as `unavailable`, never silently defaulted.
 */

/** How trustworthy a given detector/algorithm is in principle, independent of any single image. */
export type DetectorReliability =
  | "reliable"
  | "conditionally_reliable"
  | "experimental"
  | "unavailable";

/** Source of a recorded observation value. */
export type ObservationSource = "automatic" | "user_override";

/** A bounding region on the (possibly rotated/cropped) working image, in normalized 0-1 coordinates. */
export interface ImageRegion {
  /** 0-1, relative to processed image width */
  x: number;
  /** 0-1, relative to processed image height */
  y: number;
  /** 0-1 */
  width: number;
  /** 0-1 */
  height: number;
  /** Optional human label, e.g. "Line 2, words 3-5" */
  label?: string;
}

/** A single measured value with traceable provenance. */
export interface Observation<T = number> {
  id: string;
  value: T;
  /** 0-1 confidence in this specific measurement on this specific sample */
  confidence: number;
  source: ObservationSource;
  sampleCount?: number;
  regions?: ImageRegion[];
  notes?: string;
}

export interface QualityComponentScore {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number; // 0-1, contribution to composite
  detail: string;
}

export type ReadabilityClass =
  | "excellent"
  | "good"
  | "usable"
  | "limited"
  | "poor"
  | "unusable";

export interface QualityTile {
  id: string;
  row: number;
  col: number;
  region: ImageRegion;
  score: number; // 0-100 composite
  classification: ReadabilityClass;
  components: QualityComponentScore[];
  reliableFeatures: string[];
  limitedFeatures: string[];
  unavailableFeatures: string[];
  reasons: string[];
}

export interface ScanQualityReport {
  overallScore: number; // 0-100
  overallClass: ReadabilityClass;
  tiles: QualityTile[];
  gridRows: number;
  gridCols: number;
  componentAverages: QualityComponentScore[];
  featureReadiness: FeatureReadiness[];
}

export interface FeatureReadiness {
  featureKey: string;
  label: string;
  readability: number | null; // null = not detected / not applicable
  readiness: ReadabilityClass | "unavailable";
}

/** Evidence linking a conclusion back to specific handwriting regions and rule IDs. */
export interface Evidence {
  id: string; // e.g. "E001"
  featureKey: string;
  label: string;
  measurement: string;
  confidence: number;
  regions: ImageRegion[];
  ruleId: string;
  ruleContribution: number; // signed weight contribution
  interpretation: string;
}

export type RuleCategory =
  | "slant"
  | "pressure"
  | "baseline"
  | "size"
  | "spacing"
  | "margins"
  | "zones"
  | "letters"
  | "connections"
  | "t-bars"
  | "i-dots"
  | "ovals"
  | "signature"
  | "rhythm"
  | "legibility"
  | "personality";

export type TraitKey =
  | "emotional_expression"
  | "social_orientation"
  | "self_control"
  | "independence"
  | "adaptability"
  | "energy_drive"
  | "confidence_assertiveness"
  | "decision_style"
  | "attention_precision"
  | "communication_style"
  | "organization"
  | "flexibility"
  | "stress_pressure"
  | "imagination_creativity"
  | "goal_orientation";

export interface RuleEffect {
  trait: TraitKey;
  /** -1..1, sign indicates direction on the trait's scale */
  weight: number;
  explanation: string;
}

export interface RuleActivation {
  ruleId: string;
  category: RuleCategory;
  description: string;
  explanation: string;
  limitations?: string;
  effects: RuleEffect[];
  observationConfidence: number;
  ruleWeight: number;
  sampleSufficiency: number; // 0-1
  imageQuality: number; // 0-1
  effectiveWeight: number; // product of the above, see §26
  evidenceIds: string[];
}

export interface Contradiction {
  id: string;
  trait: TraitKey;
  description: string;
  supportingRuleIds: string[];
  opposingRuleIds: string[];
  resolutionText: string;
}

export interface TraitScore {
  trait: TraitKey;
  label: string;
  score: number; // 0-100
  confidence: number; // 0-100
  supportingRuleIds: string[];
  contradictingRuleIds: string[];
  available: boolean;
  insufficientEvidenceReason?: string;
  synthesisText: string;
}
