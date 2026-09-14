/** Dropdown choices offered for manual override of automated classifications (spec §23). */
export const OVERRIDE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  slant: [
    { value: "strong_left", label: "Strong Left" },
    { value: "moderate_left", label: "Moderate Left" },
    { value: "vertical", label: "Vertical" },
    { value: "moderate_right", label: "Moderate Right" },
    { value: "strong_right", label: "Strong Right" },
    { value: "variable", label: "Variable" },
  ],
  baseline: [
    { value: "rising", label: "Rising" },
    { value: "level", label: "Level" },
    { value: "falling", label: "Falling" },
    { value: "wavy_variable", label: "Wavy / Variable" },
  ],
  pressure: [
    { value: "light", label: "Light" },
    { value: "light_medium", label: "Light-Medium" },
    { value: "medium", label: "Medium" },
    { value: "medium_heavy", label: "Medium-Heavy" },
    { value: "heavy", label: "Heavy" },
  ],
  spacing: [
    { value: "very_narrow", label: "Very Narrow" },
    { value: "narrow", label: "Narrow" },
    { value: "moderate", label: "Moderate" },
    { value: "wide", label: "Wide" },
    { value: "very_wide", label: "Very Wide" },
    { value: "variable", label: "Variable" },
  ],
};
