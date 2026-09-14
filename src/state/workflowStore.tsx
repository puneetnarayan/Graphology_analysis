"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas, get2dContext } from "@/utils/canvas";
import { applyPreprocessing } from "@/utils/preprocess";
import { assessScanQuality } from "@/analysis/quality/qualityEngine";
import { runAnalysisInWorker } from "@/utils/runAnalysis";
import { ANALYSIS_SETTINGS } from "@/config/analysisSettings";
import type { AnalysisProgressEvent } from "@/analysis/pipeline";
import { DEFAULT_PREPROCESSING } from "@/types";
import type { AnalysisReport, PreprocessingSettings, SampleMetadata, ScanQualityReport, ObservationSource } from "@/types";
import type { PrimarySection, AnalysisSubTab } from "./navigation";

export interface ManualOverride {
  featureKey: string;
  value: string;
  source: ObservationSource;
}

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
  isAnalyzing: boolean;
  progressEvents: AnalysisProgressEvent[];
  analysisReport: AnalysisReport | null;
  overrides: Record<string, ManualOverride>;
  error: string | null;
  highlightedRegionEvidenceId: string | null;
}

interface WorkflowActions {
  setActiveSection: (s: PrimarySection) => void;
  setActiveSubTab: (t: AnalysisSubTab) => void;
  loadFile: (file: File) => Promise<void>;
  updatePreprocessing: (patch: Partial<PreprocessingSettings>) => void;
  resetPreprocessing: () => void;
  autoDeskew: () => void;
  assessQuality: () => Promise<void>;
  setAnalyzeRegardless: (v: boolean) => void;
  acceptAndAnalyze: () => Promise<void>;
  setOverride: (featureKey: string, value: string) => void;
  clearOverride: (featureKey: string) => void;
  setHighlightedEvidence: (id: string | null) => void;
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
  const [progressEvents, setProgressEvents] = useState<AnalysisProgressEvent[]>([]);
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ManualOverride>>({});
  const [error, setError] = useState<string | null>(null);
  const [highlightedRegionEvidenceId, setHighlightedRegionEvidenceId] = useState<string | null>(null);

  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

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

  const loadFile = useCallback(
    async (f: File) => {
      setError(null);
      try {
        releaseMemory();
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
        setFile(f);
        setSampleMetadata(metadata);
        setOriginalDataUrl(toAnalysisCanvas(canvas, 1000).toDataURL("image/png"));
        setPreprocessing(DEFAULT_PREPROCESSING);
        setScanQuality(null);
        setAccepted(false);
        setAnalysisReport(null);
        setOverrides({});
        recomputePreview(DEFAULT_PREPROCESSING);
        setActiveSection("prepare");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this file.");
      }
    },
    [recomputePreview, releaseMemory],
  );

  const updatePreprocessing = useCallback(
    (patch: Partial<PreprocessingSettings>) => {
      setPreprocessing((prev) => {
        const next = { ...prev, ...patch };
        recomputePreview(next);
        return next;
      });
    },
    [recomputePreview],
  );

  const resetPreprocessing = useCallback(() => {
    setPreprocessing(DEFAULT_PREPROCESSING);
    recomputePreview(DEFAULT_PREPROCESSING);
  }, [recomputePreview]);

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

  const getPreparedFullResCanvas = useCallback((): HTMLCanvasElement | null => {
    if (!originalCanvasRef.current) return null;
    return applyPreprocessing(originalCanvasRef.current, preprocessing);
  }, [preprocessing]);

  const assessQuality = useCallback(async () => {
    const prepared = getPreparedFullResCanvas();
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
  }, [getPreparedFullResCanvas]);

  const acceptAndAnalyze = useCallback(async () => {
    const prepared = getPreparedFullResCanvas();
    if (!prepared || !scanQuality || !sampleMetadata) return;
    setAccepted(true);
    setIsAnalyzing(true);
    setProgressEvents([]);
    setError(null);
    setActiveSection("analysis");
    try {
      const analysisCanvas = toAnalysisCanvas(prepared);
      const imageData = get2dContext(analysisCanvas).getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
      const report = await runAnalysisInWorker(
        { imageData, analyzeRegardlessOfQuality, sampleMetadata, preprocessing },
        (event) => setProgressEvents((prev) => [...prev.filter((e) => e.step !== event.step), event]),
      );
      setAnalysisReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzeRegardlessOfQuality, getPreparedFullResCanvas, preprocessing, sampleMetadata, scanQuality]);

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

  const reset = useCallback(() => {
    releaseMemory();
    setFile(null);
    setSampleMetadata(null);
    setPreviewDataUrl(null);
    setOriginalDataUrl(null);
    setPreprocessing(DEFAULT_PREPROCESSING);
    setScanQuality(null);
    setAccepted(false);
    setAnalysisReport(null);
    setOverrides({});
    setProgressEvents([]);
    setError(null);
    setActiveSection("upload");
  }, [releaseMemory]);

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
      progressEvents,
      analysisReport,
      overrides,
      error,
      highlightedRegionEvidenceId,
      setActiveSection,
      setActiveSubTab,
      loadFile,
      updatePreprocessing,
      resetPreprocessing,
      autoDeskew,
      assessQuality,
      setAnalyzeRegardless: setAnalyzeRegardlessOfQuality,
      acceptAndAnalyze,
      setOverride,
      clearOverride,
      setHighlightedEvidence: setHighlightedRegionEvidenceId,
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
      progressEvents,
      analysisReport,
      overrides,
      error,
      highlightedRegionEvidenceId,
      loadFile,
      updatePreprocessing,
      resetPreprocessing,
      autoDeskew,
      assessQuality,
      acceptAndAnalyze,
      setOverride,
      clearOverride,
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
