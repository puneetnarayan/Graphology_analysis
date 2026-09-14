export interface SampleMetadata {
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
  orientation: "landscape" | "portrait" | "square";
  loadedAt: string; // ISO timestamp, UI only, never persisted server-side
}

export interface PreprocessingSettings {
  rotationDegrees: number;
  crop: { x: number; y: number; width: number; height: number } | null;
  brightness: number; // -100..100
  contrast: number; // -100..100
  grayscale: boolean;
  sharpen: number; // 0..100
  noiseReduction: number; // 0..100
  backgroundNormalize: boolean;
  deskew: boolean;
  deskewAngleDegrees: number; // detected/applied
  threshold: number | null; // 0-255, null = no binarization
}

export const DEFAULT_PREPROCESSING: PreprocessingSettings = {
  rotationDegrees: 0,
  crop: null,
  brightness: 0,
  contrast: 0,
  grayscale: false,
  sharpen: 0,
  noiseReduction: 0,
  backgroundNormalize: false,
  deskew: false,
  deskewAngleDegrees: 0,
  threshold: null,
};
