import type { ImageRegion } from "@/types";
import { OCR_LOW_CONFIDENCE_THRESHOLD, type LetterFrequencyEntry, type OcrChar, type OcrLine, type OcrResult, type OcrWord } from "./types";

/**
 * tesseract.js is loaded only when OCR is actually requested (it pulls in a
 * WASM engine), so a user who never opens the Letter Recognition tab never
 * pays for it. The worker script and OCR engine (WASM core) are self-hosted
 * from /public/tesseract so only the English language model is fetched from
 * Tesseract's own CDN on first use — see README "Letter Recognition (OCR)".
 */
async function loadTesseract() {
  const Tesseract = await import("tesseract.js");
  return Tesseract;
}

function toRegion(bbox: { x0: number; y0: number; x1: number; y1: number }, width: number, height: number, label?: string): ImageRegion {
  return {
    x: Math.max(0, bbox.x0 / width),
    y: Math.max(0, bbox.y0 / height),
    width: Math.min(1, (bbox.x1 - bbox.x0) / width),
    height: Math.min(1, (bbox.y1 - bbox.y0) / height),
    label,
  };
}

export interface OcrProgressEvent {
  status: string;
  progress: number;
}

/**
 * Recognition needs to download Tesseract's pretrained English language
 * model from its CDN on first use (see README). If that fetch stalls
 * (offline, a restrictive firewall, a dead CDN), the underlying worker's
 * promise can hang indefinitely rather than reject, so we bound the whole
 * run ourselves and surface a clear, actionable error instead of a spinner
 * that never resolves.
 */
const OCR_TIMEOUT_MS = 60_000;

/**
 * Runs real OCR (Tesseract.js, LSTM engine) over the prepared handwriting
 * image and returns per-character, per-word and per-line recognition with
 * bounding boxes and confidence — an actual reading of the letters, not the
 * letter-agnostic shape buckets the rest of the app uses.
 */
export async function runOcr(canvas: HTMLCanvasElement, onProgress?: (e: OcrProgressEvent) => void): Promise<OcrResult> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          "OCR timed out. This usually means the browser couldn't download Tesseract's English language model " +
            "(needs an internet connection on first use — see the Letter Recognition privacy note). Check your " +
            "connection and try again.",
        ),
      );
    }, OCR_TIMEOUT_MS);
  });

  return Promise.race([runOcrInternal(canvas, onProgress), timeout]);
}

async function runOcrInternal(
  canvas: HTMLCanvasElement,
  onProgress: ((e: OcrProgressEvent) => void) | undefined,
): Promise<OcrResult> {
  const Tesseract = await loadTesseract();
  const started = performance.now();

  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
    logger: onProgress ? (m) => onProgress({ status: m.status, progress: m.progress }) : undefined,
  });

  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const width = canvas.width;
    const height = canvas.height;

    const chars: OcrChar[] = [];
    const words: OcrWord[] = [];
    const lines: OcrLine[] = [];

    for (const line of data.lines ?? []) {
      const lineWords: OcrWord[] = [];
      for (const word of line.words ?? []) {
        const wordChars: OcrChar[] = (word.symbols ?? []).map((sym) => {
          const c: OcrChar = {
            text: sym.text,
            confidence: sym.confidence,
            region: toRegion(sym.bbox, width, height),
          };
          chars.push(c);
          return c;
        });
        const w: OcrWord = {
          text: word.text,
          confidence: word.confidence,
          region: toRegion(word.bbox, width, height, word.text),
          chars: wordChars,
        };
        words.push(w);
        lineWords.push(w);
      }
      lines.push({
        text: line.text,
        confidence: line.confidence,
        region: toRegion(line.bbox, width, height),
        words: lineWords,
      });
    }

    const letterTotals = new Map<string, { count: number; confidenceSum: number }>();
    for (const c of chars) {
      const letter = c.text.toLowerCase();
      if (!/^[a-z]$/.test(letter)) continue;
      const entry = letterTotals.get(letter) ?? { count: 0, confidenceSum: 0 };
      entry.count += 1;
      entry.confidenceSum += c.confidence;
      letterTotals.set(letter, entry);
    }
    const letterFrequency: LetterFrequencyEntry[] = Array.from(letterTotals.entries())
      .map(([letter, { count, confidenceSum }]) => ({ letter, count, meanConfidence: confidenceSum / count }))
      .sort((a, b) => b.count - a.count);

    return {
      fullText: data.text,
      meanConfidence: data.confidence,
      lines,
      words,
      chars,
      letterFrequency,
      lowConfidenceCharCount: chars.filter((c) => c.confidence < OCR_LOW_CONFIDENCE_THRESHOLD).length,
      durationMs: performance.now() - started,
    };
  } finally {
    await worker.terminate();
  }
}
