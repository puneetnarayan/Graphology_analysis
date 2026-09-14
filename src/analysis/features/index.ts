import { toGrayscale, otsuThreshold, binarize } from "@/utils/grayscale";
import { connectedComponents, detectLines, detectWordsInLine } from "@/utils/segmentation";
import type { AllFeatureResults, ScanQualityReport } from "@/types";
import { componentsByLineMap, estimateXHeightBands, plausibleLetterComponents } from "./common";
import type { PipelineContext } from "./pipelineContext";
import { classifyComponentShapes } from "./shapeClassifier";
import { extractSlant } from "./slant";
import { extractBaseline } from "./baseline";
import { extractSize } from "./size";
import { extractSpacing } from "./spacing";
import { extractMargins } from "./margins";
import { extractZones } from "./zones";
import { extractPressure } from "./pressure";
import { extractTBars, extractIDots, extractOvals } from "./smallForms";
import { extractLegibility, extractRhythm } from "./legibilityRhythm";
import { extractSignature } from "./signature";
import { extractLetterShapes } from "./letterShapes";

export interface ExtractionResult {
  features: AllFeatureResults;
  context: PipelineContext;
  linesDetected: number;
  wordsDetected: number;
  lettersDetected: number;
}

export function buildPipelineContext(
  imageData: ImageData,
  scanQuality: ScanQualityReport,
  analyzeRegardlessOfQuality: boolean,
): PipelineContext {
  const width = imageData.width;
  const height = imageData.height;
  const gray = toGrayscale(imageData);
  const threshold = otsuThreshold(gray);
  const mask = binarize(gray, threshold);

  const lines = detectLines(mask, width, height);
  const components = connectedComponents(mask, width, height, lines);
  const plausibleComponents = plausibleLetterComponents(components, width, height);
  const componentsByLine = componentsByLineMap(plausibleComponents);
  const xHeightBands = estimateXHeightBands(lines, componentsByLine);
  const bandByLine = new Map(xHeightBands.map((b) => [b.lineIndex, b]));
  const componentShapes = classifyComponentShapes(plausibleComponents, bandByLine, mask, width, height);
  const lineWordData = lines.map((line) => {
    const { words, letterGapPx, wordGapPx } = detectWordsInLine(mask, width, line);
    return { line, words, letterGapPx, wordGapPx };
  });

  return {
    canvasWidth: width,
    canvasHeight: height,
    gray,
    mask,
    threshold,
    lines,
    components,
    plausibleComponents,
    componentsByLine,
    xHeightBands,
    componentShapes,
    lineWordData,
    scanQuality,
    analyzeRegardlessOfQuality,
  };
}

export function extractAllFeatures(ctx: PipelineContext): ExtractionResult {
  const features: AllFeatureResults = {
    slant: extractSlant(ctx),
    baseline: extractBaseline(ctx),
    size: extractSize(ctx),
    spacing: extractSpacing(ctx),
    margins: extractMargins(ctx),
    zones: extractZones(ctx),
    pressure: extractPressure(ctx),
    tBars: extractTBars(ctx),
    iDots: extractIDots(ctx),
    ovals: extractOvals(ctx),
    legibility: extractLegibility(ctx),
    rhythm: extractRhythm(ctx),
    signature: extractSignature(ctx),
    letterShapes: extractLetterShapes(ctx),
  };

  const wordsDetected = ctx.lineWordData.reduce((a, l) => a + l.words.length, 0);

  return {
    features,
    context: ctx,
    linesDetected: ctx.lines.length,
    wordsDetected,
    lettersDetected: ctx.plausibleComponents.length,
  };
}
