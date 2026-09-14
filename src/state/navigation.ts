export type AnalysisSubTab =
  | "overall"
  | "slant"
  | "size"
  | "pressure"
  | "baseline"
  | "spacing"
  | "margins"
  | "zones"
  | "letterForms"
  | "connections"
  | "tBars"
  | "iDots"
  | "ovals"
  | "capitals"
  | "punctuation"
  | "rhythm"
  | "legibility"
  | "signature";

export type PrimarySection =
  | "upload"
  | "prepare"
  | "quality"
  | "analysis"
  | "ocr"
  | "profile"
  | "evidence"
  | "report"
  | "formations"
  | "bookPdf";

export type FormationsSubTab = "library" | "traitIndex" | "backup";

export interface FormationsSubTabDef {
  key: FormationsSubTab;
  label: string;
}

export const FORMATIONS_SUB_TABS: FormationsSubTabDef[] = [
  { key: "library", label: "Formation Library" },
  { key: "traitIndex", label: "Trait Index" },
  { key: "backup", label: "Backup & Restore" },
];

export type OcrSubTab = "text" | "letters" | "confidence";

export interface OcrSubTabDef {
  key: OcrSubTab;
  label: string;
}

export const OCR_SUB_TABS: OcrSubTabDef[] = [
  { key: "text", label: "Recognized Text" },
  { key: "letters", label: "Per-Letter Detail" },
  { key: "confidence", label: "Confidence & Frequency" },
];

export interface AnalysisSubTabDef {
  key: AnalysisSubTab;
  label: string;
  featureKey?: string;
}

export const ANALYSIS_SUB_TABS: AnalysisSubTabDef[] = [
  { key: "overall", label: "Overall" },
  { key: "slant", label: "Slant", featureKey: "slant" },
  { key: "size", label: "Size", featureKey: "size" },
  { key: "pressure", label: "Pressure", featureKey: "pressure" },
  { key: "baseline", label: "Baseline", featureKey: "baseline" },
  { key: "spacing", label: "Spacing", featureKey: "spacing" },
  { key: "margins", label: "Margins", featureKey: "margins" },
  { key: "zones", label: "Zones", featureKey: "zones" },
  { key: "letterForms", label: "Letter Forms", featureKey: "letterShapes" },
  { key: "connections", label: "Connections" },
  { key: "tBars", label: "T-Bars", featureKey: "tBars" },
  { key: "iDots", label: "I-Dots", featureKey: "iDots" },
  { key: "ovals", label: "Ovals", featureKey: "ovals" },
  { key: "capitals", label: "Capital Letters" },
  { key: "punctuation", label: "Punctuation" },
  { key: "rhythm", label: "Rhythm & Speed", featureKey: "rhythm" },
  { key: "legibility", label: "Legibility", featureKey: "legibility" },
  { key: "signature", label: "Signature", featureKey: "signature" },
];

export const PRIMARY_SECTIONS: { key: PrimarySection; label: string }[] = [
  { key: "upload", label: "Upload Sample" },
  { key: "prepare", label: "Image Preparation" },
  { key: "quality", label: "Scan Quality" },
  { key: "analysis", label: "Analysis" },
  { key: "ocr", label: "Letter Recognition (OCR)" },
  { key: "profile", label: "Personality Profile" },
  { key: "evidence", label: "Evidence & Rules" },
  { key: "report", label: "Report" },
  { key: "formations", label: "Letter Formations" },
  { key: "bookPdf", label: "Book / PDF" },
];
