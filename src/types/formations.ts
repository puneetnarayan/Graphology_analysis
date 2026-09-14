/**
 * The handwriting-analysis parameters this library's entries are organized
 * by — deliberately the same vocabulary as the app's own Analysis tabs
 * (`ANALYSIS_SUB_TABS` in `src/state/navigation.ts`, minus "Overall"), so a
 * formation you save here lines up with the same categories the rule engine
 * itself measures, rather than an unrelated ad hoc taxonomy.
 */
export const HANDWRITING_PARAMETERS = [
  "Slant",
  "Size",
  "Pressure",
  "Baseline",
  "Spacing",
  "Margins",
  "Zones",
  "Letter Forms",
  "Connections",
  "T-Bars",
  "I-Dots",
  "Ovals",
  "Capitals",
  "Punctuation",
  "Rhythm & Speed",
  "Legibility",
  "Signature",
] as const;

/** A single user-contributed example of a letter formation and the trait it's said to indicate. */
export interface FormationEntry {
  id: string;
  /**
   * Downscaled image as a data URL — kept small so the library stays light.
   * Optional: incomplete entries (added before the image was on hand) can
   * omit it and have it filled in later via inline edit.
   */
  imageDataUrl?: string;
  /** Description of the formation, e.g. "Wavy line — no angles, just curves". */
  detail: string;
  /** The personality trait / aspect this formation is said to indicate, e.g. "Diplomatic". */
  trait: string;
  /**
   * Which handwriting-analysis parameter this formation is about — one of
   * `HANDWRITING_PARAMETERS` (e.g. "T-Bars", "Slant", "Margins"), or a
   * custom value for anything that doesn't fit that list. Older entries
   * saved before this field existed may hold free text here instead.
   */
  parameter: string;
  /**
   * The specific letter, digit, or punctuation mark this formation
   * illustrates (e.g. "t", "y", ","), when the parameter is character-
   * specific (T-Bars, I-Dots, Ovals, Letter Forms, Connections, Capitals
   * commonly are). Left blank for whole-writing parameters like Slant,
   * Baseline, Margins, Spacing, Pressure, Rhythm, Legibility, Zones, Size
   * and Signature, which aren't about any one letter.
   */
  character?: string;
  /** Narrower grouping within the parameter, e.g. "Garland", "Angular". */
  subCategory: string;
  createdAt: string;
}
