import { runAnalysisPipeline, type AnalysisProgressEvent, type RunAnalysisInput } from "@/analysis/pipeline";

export interface AnalysisWorkerRequest {
  type: "run";
  input: RunAnalysisInput;
}

export type AnalysisWorkerResponse =
  | { type: "progress"; event: AnalysisProgressEvent }
  | { type: "result"; report: ReturnType<typeof runAnalysisPipeline> }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<AnalysisWorkerRequest>) => {
  const { data } = e;
  if (data.type !== "run") return;
  try {
    const report = runAnalysisPipeline(data.input, (event) => {
      (self as unknown as Worker).postMessage({ type: "progress", event } satisfies AnalysisWorkerResponse);
    });
    (self as unknown as Worker).postMessage({ type: "result", report } satisfies AnalysisWorkerResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Unknown analysis error",
    } satisfies AnalysisWorkerResponse);
  }
};

export {};
