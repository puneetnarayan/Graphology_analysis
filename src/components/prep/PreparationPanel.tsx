"use client";

import { useRef, useState } from "react";
import { useWorkflow, DEFAULT_LIVE_UPDATE_DELAY_MS, MIN_LIVE_UPDATE_DELAY_MS } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DEFAULT_PREPROCESSING } from "@/types";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs">
      <span className="flex justify-between text-text-muted font-medium">
        <span>{label}</span>
        <span className="text-text-strong">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--primary)]"
      />
    </label>
  );
}

interface DragRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function LiveAnalysisCard() {
  const ctx = useWorkflow();
  const delaySeconds = (ctx.liveUpdateDelayMs / 1000).toFixed(2);

  const trend = ctx.confidenceTrend;
  const trendDisplay =
    trend && trend.direction !== "flat"
      ? { symbol: trend.direction === "up" ? "▲" : "▼", tone: trend.direction === "up" ? "text-success" : "text-danger" }
      : trend
        ? { symbol: "→", tone: "text-text-muted" }
        : null;

  return (
    <Card>
      <CardTitle>Live Analysis</CardTitle>
      <CardSubtitle>
        {ctx.accepted
          ? "The report updates automatically as you adjust settings below."
          : "Run your first analysis (below) to enable automatic live updates as you adjust settings."}
      </CardSubtitle>

      {ctx.accepted && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2.5">
          <div>
            <p className="text-[11px] text-text-muted">Analysis Confidence</p>
            <p className="text-lg font-semibold text-text-strong">
              {ctx.analysisReport ? `${ctx.analysisReport.overallConfidence}%` : "—"}
              {trendDisplay && (
                <span className={`ml-1.5 text-sm font-medium ${trendDisplay.tone}`}>
                  {trendDisplay.symbol}
                  {trend && trend.direction !== "flat" ? ` ${Math.abs(trend.delta)}` : ""}
                </span>
              )}
            </p>
          </div>
          {ctx.isLiveUpdating && (
            <span className="flex items-center gap-1.5 text-xs text-primary-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Updating…
            </span>
          )}
        </div>
      )}

      <label className="mt-3 flex flex-col gap-1.5 text-xs">
        <span className="flex justify-between text-text-muted font-medium">
          <span>Live update delay</span>
          <span className="text-text-strong">{delaySeconds}s</span>
        </span>
        <input
          type="range"
          min={MIN_LIVE_UPDATE_DELAY_MS}
          max={1500}
          step={50}
          value={ctx.liveUpdateDelayMs}
          onChange={(e) => ctx.setLiveUpdateDelayMs(Number(e.target.value))}
          className="w-full accent-[color:var(--primary)]"
        />
        <span className="text-[11px] text-text-muted">
          Delay after your last change before the report recomputes. Default {DEFAULT_LIVE_UPDATE_DELAY_MS / 1000}s.
        </span>
      </label>
    </Card>
  );
}

export function PreparationPanel() {
  const ctx = useWorkflow();
  const { preprocessing: p } = ctx;
  const imgRef = useRef<HTMLImageElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [drag, setDrag] = useState<DragRect | null>(null);
  const dragging = useRef(false);

  if (!ctx.hasImage) {
    return (
      <Card>
        <CardTitle>No sample loaded</CardTitle>
        <CardSubtitle>Upload a handwriting sample first.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("upload")}>
          Go to Upload
        </Button>
      </Card>
    );
  }

  const pointerToFraction = (e: React.PointerEvent<HTMLImageElement>) => {
    const rect = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const applyCrop = () => {
    if (!drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const width = Math.abs(drag.x1 - drag.x0);
    const height = Math.abs(drag.y1 - drag.y0);
    if (width < 0.03 || height < 0.03) return;
    ctx.updatePreprocessing({ crop: { x, y, width, height } });
    setCropMode(false);
    setDrag(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-strong">Image Preparation</h2>
          <p className="text-sm text-text-muted mt-1">
            Adjust the sample before analysis. The original is always preserved and can be restored at any time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={ctx.resetPreprocessing}>
            Reset All
          </Button>
          <Button onClick={() => ctx.assessQuality()} disabled={ctx.isAssessingQuality}>
            {ctx.isAssessingQuality ? "Assessing…" : "Continue to Scan Quality →"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <Card padding="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-text-muted mb-1.5 px-1">Original</p>
              {ctx.originalDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ctx.originalDataUrl} alt="Original sample" className="w-full rounded-lg border border-border-soft bg-surface-alt object-contain" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-text-muted mb-1.5 px-1">Processed {cropMode && "(drag to select crop)"}</p>
              <div className="relative select-none">
                {ctx.previewDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={imgRef}
                    src={ctx.previewDataUrl}
                    alt="Processed sample"
                    className={`w-full rounded-lg border border-border-soft bg-surface-alt object-contain ${cropMode ? "cursor-crosshair" : ""}`}
                    onPointerDown={(e) => {
                      if (!cropMode) return;
                      const f = pointerToFraction(e);
                      dragging.current = true;
                      setDrag({ x0: f.x, y0: f.y, x1: f.x, y1: f.y });
                    }}
                    onPointerMove={(e) => {
                      if (!cropMode || !dragging.current) return;
                      const f = pointerToFraction(e);
                      setDrag((prev) => (prev ? { ...prev, x1: f.x, y1: f.y } : prev));
                    }}
                    onPointerUp={() => {
                      dragging.current = false;
                    }}
                  />
                )}
                {drag && cropMode && (
                  <div
                    className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                    style={{
                      left: `${Math.min(drag.x0, drag.x1) * 100}%`,
                      top: `${Math.min(drag.y0, drag.y1) * 100}%`,
                      width: `${Math.abs(drag.x1 - drag.x0) * 100}%`,
                      height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <LiveAnalysisCard />

          <Card>
            <CardTitle>Rotate & Crop</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => ctx.updatePreprocessing({ rotationDegrees: p.rotationDegrees - 90 })}>
                ↺ Rotate Left
              </Button>
              <Button variant="outline" onClick={() => ctx.updatePreprocessing({ rotationDegrees: p.rotationDegrees + 90 })}>
                Rotate Right ↻
              </Button>
              <Button variant="outline" onClick={() => ctx.updatePreprocessing({ rotationDegrees: 0 })}>
                Reset Rotation
              </Button>
            </div>
            <div className="mt-3">
              <Slider
                label="Fine rotation"
                value={p.rotationDegrees}
                min={-180}
                max={180}
                onChange={(v) => ctx.updatePreprocessing({ rotationDegrees: v })}
                suffix="°"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {!cropMode ? (
                <Button variant="outline" onClick={() => setCropMode(true)}>
                  Crop
                </Button>
              ) : (
                <>
                  <Button onClick={applyCrop}>Apply Crop</Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCropMode(false);
                      setDrag(null);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {p.crop && (
                <Button variant="ghost" onClick={() => ctx.updatePreprocessing({ crop: null })}>
                  Clear Crop
                </Button>
              )}
            </div>
            <div className="mt-3">
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <input
                  type="checkbox"
                  checked={p.deskew}
                  onChange={(e) => ctx.updatePreprocessing({ deskew: e.target.checked })}
                />
                Apply auto-deskew
              </label>
              <Button variant="ghost" className="mt-1 px-0 text-xs" onClick={ctx.autoDeskew}>
                Detect skew angle →
              </Button>
              {p.deskew && <p className="text-[11px] text-text-muted mt-1">Correcting {p.deskewAngleDegrees.toFixed(1)}°</p>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Tone & Clarity</CardTitle>
              {ctx.isAutoTuning && (
                <span className="flex items-center gap-1.5 text-[11px] text-primary-dark">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Auto-tuning…
                </span>
              )}
            </div>
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={ctx.autoCorrectEnabled}
                onChange={(e) => ctx.setAutoCorrectEnabled(e.target.checked)}
              />
              <span>
                <span className="font-medium text-text-strong">Auto-correct for maximum confidence</span>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Searches brightness, contrast, sharpen, noise reduction, grayscale and background normalization for
                  the combination with the highest scan-quality score. Runs automatically when you upload a sample;
                  best-effort local search, not a guaranteed global optimum.
                </p>
              </span>
            </label>
            <Button
              variant="ghost"
              className="mt-1 px-0 text-xs"
              onClick={ctx.runAutoTune}
              disabled={ctx.isAutoTuning}
            >
              {ctx.isAutoTuning ? "Tuning…" : "Re-run auto-tune now →"}
            </Button>
            <div className="mt-3 flex flex-col gap-3">
              <Slider label="Brightness" value={p.brightness} min={-100} max={100} onChange={(v) => ctx.updatePreprocessing({ brightness: v })} />
              <Slider label="Contrast" value={p.contrast} min={-100} max={100} onChange={(v) => ctx.updatePreprocessing({ contrast: v })} />
              <Slider label="Sharpen" value={p.sharpen} min={0} max={100} onChange={(v) => ctx.updatePreprocessing({ sharpen: v })} />
              <Slider label="Noise Reduction" value={p.noiseReduction} min={0} max={100} onChange={(v) => ctx.updatePreprocessing({ noiseReduction: v })} />
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <input type="checkbox" checked={p.grayscale} onChange={(e) => ctx.updatePreprocessing({ grayscale: e.target.checked })} />
                Grayscale
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <input
                  type="checkbox"
                  checked={p.backgroundNormalize}
                  onChange={(e) => ctx.updatePreprocessing({ backgroundNormalize: e.target.checked })}
                />
                Background normalization
              </label>
            </div>
          </Card>

          <Card>
            <CardTitle>Binarization</CardTitle>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
                <input
                  type="checkbox"
                  checked={p.threshold !== null}
                  onChange={(e) => ctx.updatePreprocessing({ threshold: e.target.checked ? 128 : null })}
                />
                Threshold (black & white)
              </label>
              {p.threshold !== null && (
                <Slider label="Threshold" value={p.threshold} min={0} max={255} onChange={(v) => ctx.updatePreprocessing({ threshold: v })} />
              )}
            </div>
          </Card>

          <Button
            variant="ghost"
            onClick={() => ctx.updatePreprocessing(DEFAULT_PREPROCESSING)}
            className="text-xs justify-start"
          >
            Reset all adjustments to defaults
          </Button>
        </div>
      </div>
    </div>
  );
}
