import type { ImageRegion } from "@/types";

/** A single recognized character, with position and Tesseract's own confidence. */
export interface OcrChar {
  text: string;
  /** 0-100, as reported by the OCR engine for this exact glyph. */
  confidence: number;
  region: ImageRegion;
}

export interface OcrWord {
  text: string;
  confidence: number;
  region: ImageRegion;
  chars: OcrChar[];
}

export interface OcrLine {
  text: string;
  confidence: number;
  region: ImageRegion;
  words: OcrWord[];
}

export interface LetterFrequencyEntry {
  /** Lowercased single character. */
  letter: string;
  count: number;
  /** Mean OCR confidence (0-100) across occurrences of this letter. */
  meanConfidence: number;
}

export interface OcrResult {
  /** Full recognized text, exactly as returned by the OCR engine. */
  fullText: string;
  /** Page-level mean confidence, 0-100. */
  meanConfidence: number;
  lines: OcrLine[];
  words: OcrWord[];
  chars: OcrChar[];
  /** Per-letter frequency table (a-z), sorted by descending count. */
  letterFrequency: LetterFrequencyEntry[];
  /** Count of recognized characters below the "reliable" confidence threshold. */
  lowConfidenceCharCount: number;
  /** Wall-clock time the recognition pass took, in milliseconds. */
  durationMs: number;
}

/** Characters below this OCR confidence are flagged as low-confidence in the UI. */
export const OCR_LOW_CONFIDENCE_THRESHOLD = 60;
