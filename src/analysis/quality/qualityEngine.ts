import {
  FEATURE_READABILITY_REQUIREMENT,
  QUALITY_COMPONENT_WEIGHTS,
  QUALITY_GRID,
  classifyReadability,
} from "@/config/readabilityThresholds";
import { toGrayscale, otsuThreshold, binarize, type GrayBuffer } from "@/utils/grayscale";
import {
  clippingFraction,
  illuminationUniformity,
  laplacianVariance,
  noiseEstimate,
  rmsContrast,
} from "@/utils/imageMetrics";
import { estimateSkewAngle } from "@/utils/segmentation";
import { clamp } from "@/utils/stats";
import type {
  FeatureReadiness,
  ImageRegion,
  QualityComponentScore,
  QualityTile,
  ScanQualityReport,
} from "@/types";

const FEATURE_LABELS: Record<string, string> = {
  slant: "Slant",
  baseline: "Baseline",
  size: "Size",
  spacing: "Spacing",
  margins: "Margins",
  zones: "Zones",
  pressure: "Pressure",
  tBars: "T-bars",
  iDots: "I-dots",
  ovals: "Ovals",
  legibility: "Legibility",
  rhythm: "Rhythm & Speed",
  signature: "Signature",
};

function subBuffer(buf: GrayBuffer, x0: number, y0: number, x1: number, y1: number): GrayBuffer {
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      data[y * w + x] = buf.data[(y0 + y) * buf.width + (x0 + x)];
    }
  }
  return { data, width: w, height: h };
}

function inkFraction(mask: Uint8Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): number {
  let ink = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    const rowStart = y * w;
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      ink += mask[rowStart + x];
    }
  }
  return total === 0 ? 0 : ink / total;
}

function computeGrid(width: number, height: number) {
  const cols = clamp(Math.round(width / QUALITY_GRID.TARGET_TILE_PX), QUALITY_GRID.MIN_COLS, QUALITY_GRID.MAX_COLS);
  const rows = clamp(Math.round(height / QUALITY_GRID.TARGET_TILE_PX), QUALITY_GRID.MIN_ROWS, QUALITY_GRID.MAX_ROWS);
  return { rows, cols };
}

export function assessScanQuality(imageData: ImageData): ScanQualityReport {
  const width = imageData.width;
  const height = imageData.height;
  const gray = toGrayscale(imageData);
  const threshold = otsuThreshold(gray);
  const mask = binarize(gray, threshold);
  const globalSkew = Math.abs(estimateSkewAngle(mask, width, height));
  const skewScore = clamp(100 - globalSkew * 12, 0, 100);

  const { rows, cols } = computeGrid(width, height);
  const tileW = width / cols;
  const tileH = height / rows;

  const tiles: QualityTile[] = [];
  const componentSums: Record<string, { total: number; count: number }> = {};
  const addComponent = (key: string, value: number) => {
    if (!componentSums[key]) componentSums[key] = { total: 0, count: 0 };
    componentSums[key].total += value;
    componentSums[key].count += 1;
  };

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = Math.floor(c * tileW);
      const y0 = Math.floor(r * tileH);
      const x1 = Math.floor((c + 1) * tileW);
      const y1 = Math.floor((r + 1) * tileH);
      const coverage = inkFraction(mask, width, height, x0, y0, x1, y1);

      const region: ImageRegion = {
        x: x0 / width,
        y: y0 / height,
        width: (x1 - x0) / width,
        height: (y1 - y0) / height,
        label: `Row ${r + 1}, Col ${c + 1}`,
      };

      if (coverage < 0.003) {
        tiles.push({
          id: `tile-${r}-${c}`,
          row: r,
          col: c,
          region,
          score: 0,
          classification: "unusable",
          components: [],
          reliableFeatures: [],
          limitedFeatures: [],
          unavailableFeatures: Object.keys(FEATURE_LABELS),
          reasons: ["No handwriting detected in this region"],
        });
        continue;
      }

      const tileGray = subBuffer(gray, x0, y0, x1, y1);
      const resolutionPx = Math.min(x1 - x0, y1 - y0);
      const resolutionScore = clamp((resolutionPx / QUALITY_GRID.TARGET_TILE_PX) * 100, 20, 100);
      const sharpness = clamp((laplacianVariance(tileGray) / 260) * 100, 0, 100);
      const contrast = clamp(rmsContrast(tileGray) * 100, 0, 100);
      const clip = clippingFraction(tileGray);
      const foregroundSeparation = clamp(100 - clip * 260, 0, 100);
      const noise = clamp(100 - noiseEstimate(tileGray) * 100, 0, 100);
      const illumination = clamp(illuminationUniformity(tileGray) * 100, 0, 100);
      const coverageScore = clamp(100 - Math.abs(coverage - 0.14) * 420, 10, 100);
      const inkDensityScore = clamp(contrast * 0.6 + foregroundSeparation * 0.4, 0, 100);
      const strokeContinuity = clamp(sharpness * 0.5 + noise * 0.5, 0, 100);

      const components: QualityComponentScore[] = [
        { key: "resolution", label: "Resolution", score: resolutionScore, weight: QUALITY_COMPONENT_WEIGHTS.resolution, detail: `${resolutionPx.toFixed(0)}px tile edge` },
        { key: "sharpness", label: "Focus / Sharpness", score: sharpness, weight: QUALITY_COMPONENT_WEIGHTS.sharpness, detail: "Edge-response variance" },
        { key: "contrast", label: "Contrast", score: contrast, weight: QUALITY_COMPONENT_WEIGHTS.contrast, detail: "RMS pixel contrast" },
        { key: "foregroundSeparation", label: "Foreground/Background Separation", score: foregroundSeparation, weight: QUALITY_COMPONENT_WEIGHTS.foregroundSeparation, detail: "Highlight/shadow clipping" },
        { key: "strokeContinuity", label: "Stroke Continuity", score: strokeContinuity, weight: QUALITY_COMPONENT_WEIGHTS.strokeContinuity, detail: "Edge sharpness + noise composite" },
        { key: "noise", label: "Noise", score: noise, weight: QUALITY_COMPONENT_WEIGHTS.noise, detail: "High-frequency pixel variation" },
        { key: "illuminationUniformity", label: "Illumination Uniformity", score: illumination, weight: QUALITY_COMPONENT_WEIGHTS.illuminationUniformity, detail: "Regional brightness spread" },
        { key: "skew", label: "Skew", score: skewScore, weight: QUALITY_COMPONENT_WEIGHTS.skew, detail: `${globalSkew.toFixed(1)}° estimated document skew` },
        { key: "coverage", label: "Handwriting Coverage", score: coverageScore, weight: QUALITY_COMPONENT_WEIGHTS.coverage, detail: `${(coverage * 100).toFixed(1)}% ink coverage` },
        { key: "inkDensity", label: "Ink Density", score: inkDensityScore, weight: QUALITY_COMPONENT_WEIGHTS.inkDensity, detail: "Foreground darkness/consistency" },
      ];

      components.forEach((comp) => addComponent(comp.key, comp.score));

      const score = clamp(components.reduce((sum, comp) => sum + comp.score * comp.weight, 0), 0, 100);
      const classification = classifyReadability(score);

      const reliableFeatures: string[] = [];
      const limitedFeatures: string[] = [];
      const unavailableFeatures: string[] = [];
      for (const [key, req] of Object.entries(FEATURE_READABILITY_REQUIREMENT)) {
        if (score >= req) reliableFeatures.push(key);
        else if (score >= req - 20) limitedFeatures.push(key);
        else unavailableFeatures.push(key);
      }

      const reasons: string[] = [];
      if (sharpness < 45) reasons.push("Low sharpness / possible focus blur");
      if (contrast < 40) reasons.push("Low contrast between ink and background");
      if (noise < 50) reasons.push("Elevated image noise");
      if (illumination < 55) reasons.push("Uneven illumination");
      if (globalSkew > 4) reasons.push("Document skew detected");
      if (reasons.length === 0) reasons.push("No significant quality issues detected");

      tiles.push({
        id: `tile-${r}-${c}`,
        row: r,
        col: c,
        region,
        score,
        classification,
        components,
        reliableFeatures,
        limitedFeatures,
        unavailableFeatures,
        reasons,
      });
    }
  }

  const scoredTiles = tiles.filter((t) => t.components.length > 0);
  const overallScore = scoredTiles.length
    ? scoredTiles.reduce((a, t) => a + t.score, 0) / scoredTiles.length
    : 0;

  const componentAverages: QualityComponentScore[] = Object.entries(componentSums).map(([key, v]) => {
    const label = tiles.flatMap((t) => t.components).find((c) => c.key === key)?.label ?? key;
    const weight = (QUALITY_COMPONENT_WEIGHTS as Record<string, number>)[key] ?? 0;
    return { key, label, score: v.total / v.count, weight, detail: "Average across analyzed regions" };
  });

  const featureReadiness: FeatureReadiness[] = Object.entries(FEATURE_LABELS).map(([key, label]) => {
    if (scoredTiles.length === 0) return { featureKey: key, label, readability: null, readiness: "unavailable" };
    const req = FEATURE_READABILITY_REQUIREMENT[key] ?? 50;
    const supportingTiles = scoredTiles.filter((t) => t.score >= req - 25);
    if (supportingTiles.length === 0) return { featureKey: key, label, readability: null, readiness: "unavailable" };
    const avg = supportingTiles.reduce((a, t) => a + t.score, 0) / supportingTiles.length;
    return { featureKey: key, label, readability: Math.round(avg), readiness: classifyReadability(avg) };
  });

  return {
    overallScore: Math.round(overallScore),
    overallClass: classifyReadability(overallScore),
    tiles,
    gridRows: rows,
    gridCols: cols,
    componentAverages,
    featureReadiness,
  };
}
