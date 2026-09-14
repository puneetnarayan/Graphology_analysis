"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas, get2dContext } from "@/utils/canvas";
import { applyPreprocessing } from "@/utils/preprocess";
import { assessScanQuality } from "@/analysis/quality/qualityEngine";
import { autoTuneToneForQuality } from "@/utils/autoTune";
import { runAnalysisInWorker } from "@/utils/runAnalysis";
import { ANALYSIS_SETTINGS } from "@/config/analysisSettings";
import type { AnalysisProgressEvent } from "@/analysis/pipeline";
import { DEFAULT_PREPROCESSING } from "@/types";
import type { AnalysisReport, PreprocessingSettings, SampleMetadata, ScanQualityReport, ObservationSource } from "@/types";
import type { PrimarySection, AnalysisSubTab } from "./navigation";
import { runOcr as runOcrEngine } from "@/analysis/ocr/ocrEngine";
import type { OcrProgressEvent } from "@/analysis/ocr/ocrEngine";
import type { OcrResult } from "@/analysis/ocr/types";

export interface ManualOverride {
  featureKey: string;
  value: string;
  source: ObservationSource;
}

export interface ConfidenceTrend {
  direction: "up" | "down" | "flat";
  delta: number;
}

export interface AutoTuneComparison {
  /** "confidence" once a first analysis has run (full overallConfidence); "quality" beforehand (scan-quality score only). */
  basis: "confidence" | "quality";
  before: number;
  after: number;
}

/** Default debounce delay before a live re-analysis fires after a Preparation change. */
export const DEFAULT_LIVE_UPDATE_DELAY_MS = 200;
export const MIN_LIVE_UPDATE_DELAY_MS = 50;
export const MAX_LIVE_UPDATE_DELAY_MS = 3000;

interface WorkflowState {
  activeSection: PrimarySection;
  activeSubTab: AnalysisSubTab;
  file: File | null;
  sampleMetadata: SampleMetadata | null;
  hasImage: boolean;
  previewDataUrl: string | null;
  originalDataUrl: string | null;
  preprocessing: PreprocessingSettings;
  scanQuality: ScanQualityReport | null;
  analyzeRegardlessOfQuality: boolean;
  accepted: boolean;
  isAssessingQuality: boolean;
  /** True only for the first, full-screen analysis run (Accept & Analyze). */
  isAnalyzing: boolean;
  /** True for a background re-analysis triggered by a Preparation change; the existing report stays visible while this runs. */
  isLiveUpdating: boolean;
  progressEvents: AnalysisProgressEvent[];
  analysisReport: AnalysisReport | null;
  overrides: Record<string, ManualOverride>;
  error: string | null;
  highlightedRegionEvidenceId: string | null;
  highlightedRuleId: string | null;
  liveUpdateDelayMs: number;
  confidenceTrend: ConfidenceTrend | null;
  autoCorrectEnabled: boolean;
  isAutoTuning: boolean;
  autoTuneComparison: AutoTuneComparison | null;
  ocrResult: OcrResult | null;
  isRunningOcr: boolean;
  ocrError: string | null;
  ocrProgress: OcrProgressEvent | null;
  highlightedOcrCharIndex: number | null;
}

interface WorkflowActions {
  setActiveSection: (s: PrimarySection) => void;
  setActiveSubTab: (t: AnalysisSubTab) => void;
  loadFile: (file: File) => Promise<void>;
  updatePreprocessing: (patch: Partial<PreprocessingSettings>) => void;
  resetPreprocessing: () => void;
  autoDeskew: () => void;
  setAutoCorrectEnabled: (v: boolean) => void;
  runAutoTune: () => Promise<void>;
  assessQuality: () => Promise<void>;
  setAnalyzeRegardless: (v: boolean) => void;
  acceptAndAnalyze: () => Promise<void>;
  setOverride: (featureKey: string, value: string) => void;
  clearOverride: (featureKey: string) => void;
  setHighlightedEvidence: (id: string | null) => void;
  setHighlightedRule: (ruleId: string | null) => void;
  goToRuleEvidence: (ruleId: string) => void;
  setLiveUpdateDelayMs: (ms: number) => void;
  runOcr: () => Promise<void>;
  setHighlightedOcrChar: (index: number | null) => void;
  reset: () => void;
}

type WorkflowContextValue = WorkflowState & WorkflowActions;

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

function inferOrientation(w: number, h: number): SampleMetadata["orientation"] {
  if (Math.abs(w - h) < 4) return "square";
  return w > h ? "landscape" : "portrait";
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<PrimarySection>("upload");
  const [activeSubTab, setActiveSubTab] = useState<AnalysisSubTab>("overall");
  const [file, setFile] = useState<File | null>(null);
  const [sampleMetadata, setSampleMetadata] = useState<SampleMetadata | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [preprocessing, setPreprocessing] = useState<PreprocessingSettings>(DEFAULT_PREPROCESSING);
  const [scanQuality, setScanQuality] = useState<ScanQualityReport | null>(null);
  const [analyzeRegardlessOfQuality, setAnalyzeRegardlessOfQuality] = useState(
    ANALYSIS_SETTINGS.DEFAULT_ANALYZE_REGARDLESS_OF_QUALITY,
  );
  const [accepted, setAccepted] = useState(false);
  const [isAssessingQuality, setIsAssessingQuality] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ManualOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [highlightedRegionEvidenceId, setHighlightedRegionEvidenceId] = useState<string | null>(null);
  const [highlightedRuleId, setHighlightedRuleId] = useState<string | null>(null);
  const [liveUpdateDelayMs, setLiveUpdateDelayMsState] = useState(DEFAULT_LIVE_UPDATE_DELAY_MS);
  const [confidenceTrend, setConfidenceTrend] = useState<ConfidenceTrend | null>(null);
  const [autoCorrectEnabled, setAutoCorrectEnabledState] = useState(true);
  const [isAutoTuning, setIsAutoTuning] = useState(false);
  const [autoTuneComparison, setAutoTuneComparison] = useState<AutoTuneComparison | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrProgressEvent | null>(null);
  const [highlightedOcrCharIndex, setHighlightedOcrCharIndexState] = useState<number | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConfidenceRef = useRef<number | null>(null);
  const acceptedRef = useRef(false);
  const liveUpdateDelayMsRef = useRef(DEFAULT_LIVE_UPDATE_DELAY_MS);
  const analyzeRegardlessRef = useRef(analyzeRegardlessOfQuality);
  const sampleMetadataRef = useRef<SampleMetadata | null>(null);

  useEffect(() => {
    acceptedRef.current = accepted;
  }, [accepted]);
  useEffect(() => {
    liveUpdateDelayMsRef.current = liveUpdateDelayMs;
  }, [liveUpdateDelayMs]);
  useEffect(() => {
    analyzeRegardlessRef.current = analyzeRegardlessOfQuality;
  }, [analyzeRegardlessOfQuality]);
  useEffect(() => {
    sampleMetadataRef.current = sampleMetadata;
  }, [sampleMetadata]);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Debounce timer must be cleared on unmount, not just on the next reschedule.
  useEffect(() => clearDebounceTimer, [clearDebounceTimer]);

  const releaseMemory = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    originalCanvasRef.current = null;
  }, []);

  const recomputePreview = useCallback((settings: PreprocessingSettings) => {
    if (!originalCanvasRef.current) return;
    try {
      const prepared = applyPreprocessing(originalCanvasRef.current, settings);
      setPreviewDataUrl(prepared.toDataURL("image/png"));
    } catch {
      setError("Image preparation failed. Try resetting adjustments.");
    }
  }, []);

  const preparedCanvasFor = useCallback((settings: PreprocessingSettings): HTMLCanvasElement | null => {
    if (!originalCanvasRef.current) return null;
    return applyPreprocessing(originalCanvasRef.current, settings);
  }, []);

  /**
   * Runs scan-quality assessment + the full feature-extraction/rule-engine
   * pipeline in one continuous pass (spec: "do all the analysis in one go").
   * `initial` drives the full-screen progress view (first Accept & Analyze);
   * a non-initial run is a silent background re-analysis triggered by a
   * Preparation change — the previous report stays on screen until the new
   * one is ready, so re-tuning settings never blocks on a wait screen.
   */
  const runFullAnalysis = useCallback(
    async (settingsForRun: PreprocessingSettings, opts: { initial: boolean }) => {
      const metadata = sampleMetadataRef.current;
      const prepared = preparedCanvasFor(settingsForRun);
      if (!prepared || !metadata) return;

      if (opts.initial) {
        setIsAnalyzing(true);
        setProgressEvents([]);
        setActiveSection("analysis");
      } else {
        setIsLiveUpdating(true);
      }
      setError(null);

      try {
        const analysisCanvas = toAnalysisCanvas(prepared);
        const imageData = get2dContext(analysisCanvas).getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
        const quality = assessScanQuality(imageData);
        setScanQuality(quality);

        const report = await runAnalysisInWorker(
          { imageData, analyzeRegardlessOfQuality: analyzeRegardlessRef.current, sampleMetadata: metadata, preprocessing: settingsForRun },
          (event) => {
            if (opts.initial) setProgressEvents((prev) => [...prev.filter((e) => e.step !== event.step), event]);
          },
        );

        const prevConfidence = lastConfidenceRef.current;
        if (prevConfidence !== null) {
          const delta = report.overallConfidence - prevConfidence;
          setConfidenceTrend({
            direction: delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat",
            delta: Math.round(delta),
          });
        }
        lastConfidenceRef.current = report.overallConfidence;
        setAnalysisReport(report);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed.");
      } finally {
        if (opts.initial) setIsAnalyzing(false);
        else setIsLiveUpdating(false);
      }
    },
    [preparedCanvasFor],
  );

  const scheduleLiveUpdate = useCallback(
    (next: PreprocessingSettings) => {
      if (!acceptedRef.current) return;
      clearDebounceTimer();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        runFullAnalysis(next, { initial: false });
      }, liveUpdateDelayMsRef.current);
    },
    [clearDebounceTimer, runFullAnalysis],
  );

  const loadFile = useCallback(
    async (f: File) => {
      setError(null);
      try {
        releaseMemory();
        clearDebounceTimer();
        const img = await loadImageElement(f);
        const canvas = imageElementToCanvas(img);
        originalCanvasRef.current = canvas;

        const metadata: SampleMetadata = {
          filename: f.name,
          fileSizeBytes: f.size,
          mimeType: f.type || "unknown",
          width: canvas.width,
          height: canvas.height,
          orientation: inferOrientation(canvas.width, canvas.height),
          loadedAt: new Date().toISOString(),
        };
        // Set the ref synchronously too — runFullAnalysis (called below, in
        // this same tick) reads sampleMetadataRef directly, and the effect
        // that normally keeps it in sync with state hasn't run yet.
        sampleMetadataRef.current = metadata;
        setFile(f);
        setSampleMetadata(metadata);
        setOriginalDataUrl(toAnalysisCanvas(canvas, 1000).toDataURL("image/png"));
        setScanQuality(null);
        setAccepted(false);
        setAnalysisReport(null);
        setOverrides({});
        lastConfidenceRef.current = null;
        setConfidenceTrend(null);
        setAutoTuneComparison(null);
        setOcrResult(null);
        setOcrError(null);
        setOcrProgress(null);
        setHighlightedOcrCharIndexState(null);

        let initialSettings = DEFAULT_PREPROCESSING;
        if (autoCorrectEnabled) {
          setIsAutoTuning(true);
          await new Promise((r) => setTimeout(r, 0));
          try {
            initialSettings = autoTuneToneForQuality(canvas, DEFAULT_PREPROCESSING).settings;
          } finally {
            setIsAutoTuning(false);
          }
        }
        setPreprocessing(initialSettings);
        recomputePreview(initialSettings);

        // Fully automatic from here: no "Continue to Scan Quality" or
        // "Accept & Analyze" click needed. This also flips acceptedRef on
        // immediately, so if the user does go tweak Preparation settings
        // afterward, that already-existing live-update path re-analyzes in
        // the background rather than requiring another manual accept.
        setAccepted(true);
        acceptedRef.current = true;
        await runFullAnalysis(initialSettings, { initial: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this file.");
      }
    },
    [autoCorrectEnabled, clearDebounceTimer, recomputePreview, releaseMemory, runFullAnalysis],
  );

  const updatePreprocessing = useCallback(
    (patch: Partial<PreprocessingSettings>) => {
      setPreprocessing((prev) => {
        const next = { ...prev, ...patch };
        recomputePreview(next);
        scheduleLiveUpdate(next);
        return next;
      });
    },
    [recomputePreview, scheduleLiveUpdate],
  );

  const resetPreprocessing = useCallback(() => {
    setPreprocessing(DEFAULT_PREPROCESSING);
    recomputePreview(DEFAULT_PREPROCESSING);
    scheduleLiveUpdate(DEFAULT_PREPROCESSING);
  }, [recomputePreview, scheduleLiveUpdate]);

  const runAutoTune = useCallback(async () => {
    if (!originalCanvasRef.current) return;
    setIsAutoTuning(true);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const wasAccepted = acceptedRef.current;
      const beforeConfidence = lastConfidenceRef.current;
      const { settings: tuned, baselineScore, tunedScore } = autoTuneToneForQuality(originalCanvasRef.current, preprocessing);
      setPreprocessing(tuned);
      recomputePreview(tuned);

      if (wasAccepted) {
        clearDebounceTimer();
        await runFullAnalysis(tuned, { initial: false });
        setAutoTuneComparison({
          basis: "confidence",
          before: Math.round(beforeConfidence ?? baselineScore),
          after: Math.round(lastConfidenceRef.current ?? tunedScore),
        });
      } else {
        setAutoTuneComparison({
          basis: "quality",
          before: Math.round(baselineScore),
          after: Math.round(tunedScore),
        });
      }
    } finally {
      setIsAutoTuning(false);
    }
  }, [clearDebounceTimer, preprocessing, recomputePreview, runFullAnalysis]);

  const setAutoCorrectEnabled = useCallback(
    (v: boolean) => {
      setAutoCorrectEnabledState(v);
      if (v && originalCanvasRef.current) {
        runAutoTune();
      }
    },
    [runAutoTune],
  );

  const autoDeskew = useCallback(() => {
    if (!originalCanvasRef.current) return;
    import("@/utils/segmentation").then(({ estimateSkewAngle }) => {
      import("@/utils/grayscale").then(({ toGrayscale, otsuThreshold, binarize }) => {
        const canvas = originalCanvasRef.current!;
        const analysisCanvas = toAnalysisCanvas(canvas, 900);
        const imgData = get2dContext(analysisCanvas).getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
        const gray = toGrayscale(imgData);
        const threshold = otsuThreshold(gray);
        const mask = binarize(gray, threshold);
        const angle = estimateSkewAngle(mask, analysisCanvas.width, analysisCanvas.height);
        updatePreprocessing({ deskew: true, deskewAngleDegrees: angle });
      });
    });
  }, [updatePreprocessing]);

  const assessQuality = useCallback(async () => {
    const prepared = preparedCanvasFor(preprocessing);
    if (!prepared) return;
    setIsAssessingQuality(true);
    setError(null);
    try {
      const analysisCanvas = toAnalysisCanvas(prepared);
      const imageData = get2dContext(analysisCanvas).getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
      await new Promise((r) => setTimeout(r, 0));
      const report = assessScanQuality(imageData);
      setScanQuality(report);
      setActiveSection("quality");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan quality assessment failed.");
    } finally {
      setIsAssessingQuality(false);
    }
  }, [preparedCanvasFor, preprocessing]);

  const acceptAndAnalyze = useCallback(async () => {
    if (!scanQuality) return;
    setAccepted(true);
    acceptedRef.current = true;
    await runFullAnalysis(preprocessing, { initial: true });
  }, [preprocessing, runFullAnalysis, scanQuality]);

  const runOcr = useCallback(async () => {
    const prepared = preparedCanvasFor(preprocessing);
    if (!prepared) return;
    setIsRunningOcr(true);
    setOcrError(null);
    setOcrProgress(null);
    try {
      const result = await runOcrEngine(prepared, (e) => setOcrProgress(e));
      setOcrResult(result);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : "OCR recognition failed.");
    } finally {
      setIsRunningOcr(false);
    }
  }, [preparedCanvasFor, preprocessing]);

  const setHighlightedOcrChar = useCallback((index: number | null) => {
    setHighlightedOcrCharIndexState(index);
  }, []);

  const setOverride = useCallback((featureKey: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [featureKey]: { featureKey, value, source: "user_override" } }));
  }, []);

  const clearOverride = useCallback((featureKey: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[featureKey];
      return next;
    });
  }, []);

  const setHighlightedEvidence = useCallback((id: string | null) => {
    setHighlightedRuleId(null);
    setHighlightedRegionEvidenceId(id);
  }, []);

  const setHighlightedRule = useCallback((ruleId: string | null) => {
    setHighlightedRegionEvidenceId(null);
    setHighlightedRuleId(ruleId);
  }, []);

  const goToRuleEvidence = useCallback(
    (ruleId: string) => {
      setHighlightedRegionEvidenceId(null);
      setHighlightedRuleId(ruleId);
      setActiveSection("evidence");
    },
    [],
  );

  const setLiveUpdateDelayMs = useCallback((ms: number) => {
    const clamped = Math.min(MAX_LIVE_UPDATE_DELAY_MS, Math.max(MIN_LIVE_UPDATE_DELAY_MS, Math.round(ms)));
    setLiveUpdateDelayMsState(clamped);
  }, []);

  const reset = useCallback(() => {
    releaseMemory();
    clearDebounceTimer();
    setFile(null);
    setSampleMetadata(null);
    setPreviewDataUrl(null);
    setOriginalDataUrl(null);
    setPreprocessing(DEFAULT_PREPROCESSING);
    setScanQuality(null);
    setAccepted(false);
    acceptedRef.current = false;
    setAnalysisReport(null);
    setOverrides({});
    setProgressEvents([]);
    setIsLiveUpdating(false);
    setIsAutoTuning(false);
    setAutoTuneComparison(null);
    lastConfidenceRef.current = null;
    setConfidenceTrend(null);
    setError(null);
    setHighlightedRegionEvidenceId(null);
    setHighlightedRuleId(null);
    setOcrResult(null);
    setIsRunningOcr(false);
    setOcrError(null);
    setOcrProgress(null);
    setHighlightedOcrCharIndexState(null);
    setActiveSection("upload");
  }, [clearDebounceTimer, releaseMemory]);

  const value = useMemo<WorkflowContextValue>(
    () => ({
      activeSection,
      activeSubTab,
      file,
      sampleMetadata,
      hasImage: !!file,
      previewDataUrl,
      originalDataUrl,
      preprocessing,
      scanQuality,
      analyzeRegardlessOfQuality,
      accepted,
      isAssessingQuality,
      isAnalyzing,
      isLiveUpdating,
      progressEvents,
      analysisReport,
      overrides,
      error,
      highlightedRegionEvidenceId,
      highlightedRuleId,
      liveUpdateDelayMs,
      confidenceTrend,
      autoCorrectEnabled,
      isAutoTuning,
      autoTuneComparison,
      ocrResult,
      isRunningOcr,
      ocrError,
      ocrProgress,
      highlightedOcrCharIndex,
      setActiveSection,
      setActiveSubTab,
      loadFile,
      updatePreprocessing,
      resetPreprocessing,
      autoDeskew,
      setAutoCorrectEnabled,
      runAutoTune,
      assessQuality,
      setAnalyzeRegardless: setAnalyzeRegardlessOfQuality,
      acceptAndAnalyze,
      setOverride,
      clearOverride,
      setHighlightedEvidence,
      setHighlightedRule,
      goToRuleEvidence,
      setLiveUpdateDelayMs,
      runOcr,
      setHighlightedOcrChar,
      reset,
    }),
    [
      activeSection,
      activeSubTab,
      file,
      sampleMetadata,
      previewDataUrl,
      originalDataUrl,
      preprocessing,
      scanQuality,
      analyzeRegardlessOfQuality,
      accepted,
      isAssessingQuality,
      isAnalyzing,
      isLiveUpdating,
      progressEvents,
      analysisReport,
      overrides,
      error,
      highlightedRegionEvidenceId,
      highlightedRuleId,
      liveUpdateDelayMs,
      confidenceTrend,
      autoCorrectEnabled,
      isAutoTuning,
      autoTuneComparison,
      ocrResult,
      isRunningOcr,
      ocrError,
      ocrProgress,
      highlightedOcrCharIndex,
      loadFile,
      updatePreprocessing,
      resetPreprocessing,
      autoDeskew,
      setAutoCorrectEnabled,
      runAutoTune,
      assessQuality,
      acceptAndAnalyze,
      setOverride,
      clearOverride,
      setHighlightedEvidence,
      setHighlightedRule,
      goToRuleEvidence,
      setLiveUpdateDelayMs,
      runOcr,
      setHighlightedOcrChar,
      reset,
    ],
  );

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowContextValue {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within a WorkflowProvider");
  return ctx;
}
