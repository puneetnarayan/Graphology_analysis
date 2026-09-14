import { LETTER_SHAPE_THRESHOLDS } from "@/config/thresholds";
import { SHAPE_BUCKET_LABELS, type ShapeBucket } from "./shapeClassifier";
import { featureReadability, type PipelineContext } from "./pipelineContext";
import type { FeatureModuleResult, ShapeDistributionMeasurement } from "@/types";

const LOOP_BUCKETS: ShapeBucket[] = ["ascender_with_loop", "descender_with_loop", "x_height_closed_loop"];
const STEM_BUCKETS: ShapeBucket[] = ["ascender_stem", "descender_stem", "x_height_narrow_stem"];

/**
 * Aggregates the per-component shape classification (src/analysis/features/
 * shapeClassifier.ts) into an alphabet-level distribution: how many
 * components fell into each letter-agnostic shape bucket. This is the
 * "alphabet-level points" summary — loop counts, stem counts, dot and
 * crossbar candidate counts — without claiming to know which specific
 * letter produced any of them.
 */
export function extractLetterShapes(ctx: PipelineContext): FeatureModuleResult<ShapeDistributionMeasurement> {
  const key = "letterShapes";
  const label = "Letter Shapes";

  const infos = Array.from(ctx.componentShapes.values());
  if (infos.length < LETTER_SHAPE_THRESHOLDS.MIN_CLASSIFIED) {
    return {
      key,
      label,
      reliability: "experimental",
      available: false,
      unavailableReason: `Insufficient evidence: only ${infos.length} components could be shape-classified (minimum ${LETTER_SHAPE_THRESHOLDS.MIN_CLASSIFIED} required).`,
    };
  }

  const counts = new Map<ShapeBucket, number>();
  for (const info of infos) counts.set(info.bucket, (counts.get(info.bucket) ?? 0) + 1);

  const buckets = Array.from(counts.entries())
    .map(([bucket, count]) => ({
      bucket,
      label: SHAPE_BUCKET_LABELS[bucket],
      count,
      fraction: Number((count / infos.length).toFixed(3)),
    }))
    .sort((a, b) => b.count - a.count);

  const loopCount = infos.filter((i) => LOOP_BUCKETS.includes(i.bucket)).length;
  const stemCount = infos.filter((i) => STEM_BUCKETS.includes(i.bucket)).length;
  const dotCandidateCount = infos.filter((i) => i.bucket === "dot").length;
  const crossbarCandidateCount = infos.filter((i) => i.bucket === "crossbar_candidate").length;

  const readability = featureReadability(ctx, "ovals") / 100;
  const confidence = Math.min(0.75, 0.3 + readability * 0.3 + Math.min(0.15, infos.length / 200));

  const measurement: ShapeDistributionMeasurement = {
    totalClassified: infos.length,
    buckets,
    loopFraction: Number((loopCount / infos.length).toFixed(3)),
    narrowStemFraction: Number((stemCount / infos.length).toFixed(3)),
    dotCandidateCount,
    crossbarCandidateCount,
    confidence: Number(confidence.toFixed(2)),
  };

  return {
    key,
    label,
    reliability: "experimental",
    available: true,
    measurement,
    observation: {
      id: "obs-letter-shapes",
      value: measurement,
      confidence,
      source: "automatic",
      sampleCount: infos.length,
      notes:
        "Letter-agnostic shape census (loop presence, ascender/descender extension, aspect ratio). Not per-letter OCR identification.",
    },
  };
}
