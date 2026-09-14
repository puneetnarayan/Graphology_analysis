/** A single user-contributed example of a letter formation and the trait it's said to indicate. */
export interface FormationEntry {
  id: string;
  /** Downscaled image as a data URL — kept small so the library stays within localStorage limits. */
  imageDataUrl: string;
  /** Description of the formation, e.g. "Wavy line — no angles, just curves". */
  detail: string;
  /** The personality trait / aspect this formation is said to indicate, e.g. "Diplomatic". */
  trait: string;
  /** Broad grouping, e.g. "Letter connections", "Slant", "Loops". */
  category: string;
  /** Narrower grouping within the category, e.g. "Garland", "Angular". */
  subCategory: string;
  createdAt: string;
}
