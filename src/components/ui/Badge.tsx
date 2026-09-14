import type { ReactNode } from "react";
import type { ReadabilityClass, DetectorReliability } from "@/types";

const TONE_CLASSES: Record<string, string> = {
  mint: "bg-mint-soft text-[#2f6b52] border-transparent",
  peach: "bg-peach-soft text-[#8a5a28] border-transparent",
  sky: "bg-sky-soft text-[#2f5a82] border-transparent",
  blush: "bg-blush-soft text-[#8a3455] border-transparent",
  butter: "bg-butter-soft text-[#8a6d1a] border-transparent",
  success: "bg-success-soft text-[#2f6b4d] border-transparent",
  warning: "bg-warning-soft text-[#8a5f1a] border-transparent",
  danger: "bg-danger-soft text-[#8a3030] border-transparent",
  primary: "bg-primary-soft text-primary-dark border-transparent",
  neutral: "bg-surface-sunken text-text-muted border-transparent",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: keyof typeof TONE_CLASSES; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const READABILITY_TONE: Record<ReadabilityClass, keyof typeof TONE_CLASSES> = {
  excellent: "success",
  good: "mint",
  usable: "sky",
  limited: "butter",
  poor: "warning",
  unusable: "danger",
};

export function ReadabilityBadge({ classification }: { classification: ReadabilityClass }) {
  return <Badge tone={READABILITY_TONE[classification]}>{classification[0].toUpperCase() + classification.slice(1)}</Badge>;
}

const RELIABILITY_LABEL: Record<DetectorReliability, string> = {
  reliable: "Reliable",
  conditionally_reliable: "Conditionally Reliable",
  experimental: "Experimental",
  unavailable: "Unavailable",
};

const RELIABILITY_TONE: Record<DetectorReliability, keyof typeof TONE_CLASSES> = {
  reliable: "success",
  conditionally_reliable: "sky",
  experimental: "butter",
  unavailable: "neutral",
};

export function ReliabilityBadge({ reliability }: { reliability: DetectorReliability }) {
  return <Badge tone={RELIABILITY_TONE[reliability]}>{RELIABILITY_LABEL[reliability]}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  const tone: keyof typeof TONE_CLASSES = pct >= 75 ? "success" : pct >= 50 ? "sky" : pct >= 30 ? "butter" : "danger";
  return <Badge tone={tone}>Confidence {pct}%</Badge>;
}
