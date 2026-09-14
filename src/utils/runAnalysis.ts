import type { AnalysisProgressEvent, RunAnalysisInput } from "@/analysis/pipeline";
import type { AnalysisReport } from "@/types";
import type { AnalysisWorkerResponse } from "@/workers/analysisWorker";

/**
 * Runs the analysis pipeline inside a Web Worker so the UI thread stays
 * responsive (spec §36, §49). Falls back to running on the main thread if
 * Web Workers are unavailable.
 */
export function runAnalysisInWorker(
  input: RunAnalysisInput,
  onProgress: (event: AnalysisProgressEvent) => void,
  signal?: AbortSignal,
): Promise<AnalysisReport> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      import("@/analysis/pipeline").then(({ runAnalysisPipeline }) => {
        try {
          resolve(runAnalysisPipeline(input, onProgress));
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Analysis failed"));
        }
      });
      return;
    }

    const worker = new Worker(new URL("../workers/analysisWorker.ts", import.meta.url), { type: "module" });
    let settled = false;

    const cleanup = () => {
      worker.terminate();
    };

    if (signal) {
      signal.addEventListener("abort", () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new DOMException("Analysis cancelled", "AbortError"));
      });
    }

    worker.onmessage = (e: MessageEvent<AnalysisWorkerResponse>) => {
      const { data } = e;
      if (data.type === "progress") {
        onProgress(data.event);
      } else if (data.type === "result") {
        settled = true;
        cleanup();
        resolve(data.report as AnalysisReport);
      } else if (data.type === "error") {
        settled = true;
        cleanup();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(err.message || "Analysis worker failed"));
    };

    worker.postMessage({ type: "run", input });
  });
}
