"use client";

import { useState } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge, ConfidenceBadge, ReliabilityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RuleChip } from "@/components/ui/RuleChip";
import { FEATURE_TO_RULE_CATEGORY, formatMeasurementValue, humanizeMeasurementKey } from "@/config/featureCategoryMap";
import { OVERRIDE_OPTIONS } from "@/config/overrideOptions";
import { useWorkflow } from "@/state/workflowStore";
import type { FeatureModuleResult, RuleActivation, ShapeBucketCount } from "@/types";

function isShapeBucketArray(value: unknown): value is ShapeBucketCount[] {
  return (
    Array.isArray(value) &&
    value.every((v) => v && typeof v === "object" && "bucket" in v && "count" in v && "fraction" in v)
  );
}

export function FeatureDetailCard({
  featureKey,
  result,
  ruleActivations,
}: {
  featureKey: string;
  result: FeatureModuleResult<unknown>;
  ruleActivations: RuleActivation[];
}) {
  const ctx = useWorkflow();
  const [showOverride, setShowOverride] = useState(false);
  const category = FEATURE_TO_RULE_CATEGORY[featureKey];
  const relatedRules = category ? ruleActivations.filter((r) => r.category === category) : [];
  const override = ctx.overrides[featureKey];
  const options = OVERRIDE_OPTIONS[featureKey];

  const allEntries =
    result.measurement && typeof result.measurement === "object" && !Array.isArray(result.measurement)
      ? Object.entries(result.measurement as Record<string, unknown>)
      : [];
  const bucketEntry = allEntries.find(([k, v]) => k === "buckets" && isShapeBucketArray(v)) as
    | [string, ShapeBucketCount[]]
    | undefined;
  const measurementEntries = allEntries.filter(([k]) => k !== "buckets");

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>{result.label}</CardTitle>
          <CardSubtitle>{category ? `Rule category: ${category}` : "Descriptive measurement only"}</CardSubtitle>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ReliabilityBadge reliability={result.reliability} />
          {result.observation && <ConfidenceBadge confidence={result.observation.confidence} />}
        </div>
      </div>

      {!result.available && (
        <div className="mt-4 rounded-xl bg-butter-soft px-4 py-3 text-sm text-[#8a6d1a]">
          <span className="font-semibold">Insufficient evidence.</span> {result.unavailableReason}
        </div>
      )}

      {result.available && measurementEntries.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {measurementEntries.map(([k, v]) => (
            <div key={k} className="rounded-lg bg-surface-alt px-3 py-2">
              <dt className="text-[11px] text-text-muted">{humanizeMeasurementKey(k)}</dt>
              <dd className="text-sm font-semibold text-text-strong">{formatMeasurementValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {result.available && bucketEntry && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-text-muted mb-2">Shape Distribution</p>
          <p className="text-[11px] text-text-muted mb-2">
            Letter-agnostic geometric groupings (loop presence, ascender/descender extension, aspect ratio) — not
            per-letter (a/o/e/...) OCR identification.
          </p>
          <div className="flex flex-col gap-1.5">
            {bucketEntry[1].map((b) => (
              <div key={b.bucket} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 text-text-muted truncate" title={b.label}>
                  {b.label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, b.fraction * 100)}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right font-medium text-text-strong">
                  {b.count} ({Math.round(b.fraction * 100)}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {override && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Badge tone="sky">User override: {override.value.replace(/_/g, " ")}</Badge>
          <button className="text-text-muted underline" onClick={() => ctx.clearOverride(featureKey)}>
            Revert to automated result
          </button>
        </div>
      )}

      {result.available && options && (
        <div className="mt-3">
          {!showOverride ? (
            <Button variant="ghost" className="px-0 text-xs" onClick={() => setShowOverride(true)}>
              Override this observation →
            </Button>
          ) : (
            <div className="rounded-xl border border-border-soft p-3 mt-1">
              <p className="text-xs text-text-muted mb-2">Select the classification you believe is correct:</p>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      ctx.setOverride(featureKey, opt.value);
                      setShowOverride(false);
                    }}
                    className="rounded-lg border border-border-soft px-2.5 py-1.5 text-xs hover:bg-primary-soft hover:border-primary/40 hover:text-primary-dark"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="mt-2 px-0 text-xs" onClick={() => setShowOverride(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}

      {relatedRules.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-soft">
          <p className="text-xs font-semibold text-text-muted mb-2">Rules Triggered</p>
          <div className="flex flex-col gap-2">
            {relatedRules.map((r) => (
              <div key={r.ruleId} className="rounded-lg bg-surface-alt px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <RuleChip ruleId={r.ruleId} />
                  <span className="text-text-muted">Contribution {r.effectiveWeight.toFixed(2)}</span>
                </div>
                <p className="mt-1 text-text-body">{r.description}</p>
                <p className="mt-1 text-text-muted">{r.explanation}</p>
                {r.limitations && <p className="mt-1 text-text-muted italic">Limitation: {r.limitations}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
