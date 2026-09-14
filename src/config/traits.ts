import type { TraitKey } from "@/types";

export interface TraitDefinition {
  key: TraitKey;
  label: string;
  lowText: string;
  midText: string;
  highText: string;
}

export const TRAIT_DEFINITIONS: TraitDefinition[] = [
  { key: "emotional_expression", label: "Emotional Expression", lowText: "reserved emotional display", midText: "measured emotional expression", highText: "open, readily visible emotional expression" },
  { key: "social_orientation", label: "Social Orientation", lowText: "a more private, selective social stance", midText: "a balanced social orientation", highText: "outward, socially engaged orientation" },
  { key: "self_control", label: "Self-Control", lowText: "a more spontaneous, less regulated style", midText: "moderate self-regulation", highText: "strong self-discipline and containment" },
  { key: "independence", label: "Independence", lowText: "a preference for collaboration and closeness", midText: "a balance of independence and connection", highText: "a strong preference for autonomy" },
  { key: "adaptability", label: "Adaptability", lowText: "a preference for routine and predictability", midText: "moderate flexibility", highText: "readiness to adjust to changing circumstances" },
  { key: "energy_drive", label: "Energy / Drive", lowText: "conserved, lower-key energy investment", midText: "steady energy investment", highText: "high energy investment and drive" },
  { key: "confidence_assertiveness", label: "Confidence / Assertiveness", lowText: "understated self-presentation", midText: "moderate self-assurance", highText: "confident, assertive self-presentation" },
  { key: "decision_style", label: "Decision Style", lowText: "a deliberate, cautious decision style", midText: "a balanced decision style", highText: "a decisive, quick decision style" },
  { key: "attention_precision", label: "Attention / Precision", lowText: "a broader, less detail-focused style", midText: "moderate attentiveness to detail", highText: "close attentiveness to detail and precision" },
  { key: "communication_style", label: "Communication Style", lowText: "a more private, self-directed communication style", midText: "a balanced communication style", highText: "clarity-focused, reader-oriented communication" },
  { key: "organization", label: "Organization", lowText: "a more fluid, less structured approach", midText: "moderate organizational tendencies", highText: "strong organizational and planning tendencies" },
  { key: "flexibility", label: "Flexibility", lowText: "a preference for consistency", midText: "moderate flexibility", highText: "notable situational flexibility" },
  { key: "stress_pressure", label: "Stress / Pressure Indicators", lowText: "few indicators of writing-related strain", midText: "some indicators of fluctuating pressure", highText: "several indicators of elevated strain at the time of writing" },
  { key: "imagination_creativity", label: "Imagination / Creativity", lowText: "a more concrete, literal orientation", midText: "a balance of concrete and imaginative orientation", highText: "an active imaginative or ideational orientation" },
  { key: "goal_orientation", label: "Goal Orientation", lowText: "modest or cautious goal-setting", midText: "moderate goal orientation", highText: "elevated aspiration and goal-setting" },
];

export function traitLabel(key: TraitKey): string {
  return TRAIT_DEFINITIONS.find((t) => t.key === key)?.label ?? key;
}
