"use client";

import { useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReadabilityBadge } from "@/components/ui/Badge";
import type { QualityTile } from "@/types";

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#6fb894" : score >= 55 ? "#a3c9ec" : score >= 35 ? "#d9a24f" : "#d97f7f";
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - score / 100);
  return (
    <svg width="110" height="110" viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface-sunken)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="47" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text-strong)">
        {score}
      </text>
      <text x="50" y="65" textAnchor="middle" fontSize="10" fill="var(--text-muted)">
        / 100
      </text>
    </svg>
  );
}

const TILE_COLORS: Record<string, string> = {
  excellent: "rgba(111,184,148,0.32)",
  good: "rgba(164,221,199,0.4)",
  usable: "rgba(163,201,236,0.4)",
  limited: "rgba(240,221,156,0.45)",
  poor: "rgba(217,162,79,0.4)",
  unusable: "rgba(217,127,127,0.35)",
};

export function QualityPanel() {
  const ctx = useWorkflow();
  const [hoveredTile, setHoveredTile] = useState<QualityTile | null>(null);

  if (!ctx.scanQuality) {
    return (
      <Card>
        <CardTitle>Scan quality not yet assessed</CardTitle>
        <CardSubtitle>Return to Image Preparation and continue to run the readability assessment.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("prepare")}>
          Go to Image Preparation
        </Button>
      </Card>
    );
  }

  const q = ctx.scanQuality;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Scan Quality &amp; Readability</h2>
        <p className="text-sm text-text-muted mt-1">
          Review the area-wise readability before analysis. Low-quality regions reduce confidence rather than being
          silently discarded.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="flex flex-col items-center text-center gap-3">
          <ScoreRing score={q.overallScore} />
          <div>
            <p className="text-sm font-semibold text-text-strong">Overall Scan Readability</p>
            <div className="mt-1.5">
              <ReadabilityBadge classification={q.overallClass} />
            </div>
          </div>
          <div className="w-full pt-3 border-t border-border-soft mt-1">
            {q.componentAverages.slice(0, 6).map((c) => (
              <div key={c.key} className="flex justify-between text-xs py-1">
                <span className="text-text-muted">{c.label}</span>
                <span className="font-medium text-text-strong">{Math.round(c.score)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Area Readability Map</CardTitle>
          <CardSubtitle>Hover a region to see its score, reasons and feature readiness.</CardSubtitle>
          <div className="relative mt-3">
            {ctx.previewDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.previewDataUrl} alt="" className="w-full rounded-lg border border-border-soft" />
            )}
            <div
              className="absolute inset-0 grid"
              style={{ gridTemplateColumns: `repeat(${q.gridCols}, 1fr)`, gridTemplateRows: `repeat(${q.gridRows}, 1fr)` }}
            >
              {q.tiles.map((tile) => (
                <div
                  key={tile.id}
                  onMouseEnter={() => setHoveredTile(tile)}
                  onMouseLeave={() => setHoveredTile(null)}
                  className="border border-white/40 flex items-start justify-end p-1 cursor-default"
                  style={{ background: TILE_COLORS[tile.classification] }}
                >
                  <span className="text-[10px] font-semibold bg-white/70 rounded px-1 text-text-strong">
                    {Math.round(tile.score)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {hoveredTile && (
            <div className="mt-3 rounded-xl bg-surface-alt p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-strong">
                  {hoveredTile.region.label} &middot; {Math.round(hoveredTile.score)}%
                </span>
                <ReadabilityBadge classification={hoveredTile.classification} />
              </div>
              <p className="text-text-muted mt-1">{hoveredTile.reasons.join("; ")}</p>
              {hoveredTile.reliableFeatures.length > 0 && (
                <p className="mt-1">
                  <span className="text-[#2f6b52] font-medium">Good for:</span>{" "}
                  {hoveredTile.reliableFeatures.join(", ")}
                </p>
              )}
              {hoveredTile.limitedFeatures.length > 0 && (
                <p className="mt-0.5">
                  <span className="text-[#8a6d1a] font-medium">Limited:</span> {hoveredTile.limitedFeatures.join(", ")}
                </p>
              )}
              {hoveredTile.unavailableFeatures.length > 0 && (
                <p className="mt-0.5">
                  <span className="text-[#8a3030] font-medium">Poor/Unavailable:</span>{" "}
                  {hoveredTile.unavailableFeatures.join(", ")}
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle>Feature Readiness Matrix</CardTitle>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border-soft">
                <th className="py-2 font-medium">Feature</th>
                <th className="py-2 font-medium">Readability</th>
                <th className="py-2 font-medium">Analysis Readiness</th>
              </tr>
            </thead>
            <tbody>
              {q.featureReadiness.map((f) => (
                <tr key={f.featureKey} className="border-b border-border-soft/60 last:border-0">
                  <td className="py-2 font-medium text-text-strong">{f.label}</td>
                  <td className="py-2 text-text-muted">{f.readability === null ? "Not detected" : `${f.readability}%`}</td>
                  <td className="py-2">
                    <ReadabilityBadge classification={f.readiness === "unavailable" ? "unusable" : f.readiness} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="bg-primary-softer border-transparent">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ctx.analyzeRegardlessOfQuality}
            onChange={(e) => ctx.setAnalyzeRegardless(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[color:var(--primary)]"
          />
          <span className="text-sm">
            <span className="font-semibold text-text-strong">Analyze regardless of scan quality</span>
            <p className="text-xs text-text-muted mt-0.5">
              {ctx.analyzeRegardlessOfQuality
                ? "Checked (default): the analysis will proceed even where quality is limited. Low-quality regions reduce confidence and are flagged, never silently discarded."
                : "Unchecked: only regions/features meeting quality thresholds will be analyzed. If insufficient usable material remains, you'll be told what to improve."}
            </p>
          </span>
        </label>
        <div className="mt-4 flex justify-end">
          <Button onClick={ctx.acceptAndAnalyze} disabled={ctx.isAnalyzing}>
            Accept &amp; Analyze →
          </Button>
        </div>
      </Card>
    </div>
  );
}
