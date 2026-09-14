import { describe, expect, it } from "vitest";
import { SAMPLE_SUFFICIENCY } from "./thresholds";

describe("SAMPLE_SUFFICIENCY.scale", () => {
  it("returns 0 for zero samples", () => {
    expect(SAMPLE_SUFFICIENCY.scale(0, 10, 40)).toBe(0);
  });

  it("returns 1 once the sample count reaches the full threshold", () => {
    expect(SAMPLE_SUFFICIENCY.scale(40, 10, 40)).toBe(1);
    expect(SAMPLE_SUFFICIENCY.scale(100, 10, 40)).toBe(1);
  });

  it("scales partially between min and full", () => {
    const atMin = SAMPLE_SUFFICIENCY.scale(10, 10, 40);
    const mid = SAMPLE_SUFFICIENCY.scale(25, 10, 40);
    const nearFull = SAMPLE_SUFFICIENCY.scale(39, 10, 40);
    expect(atMin).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(atMin);
    expect(nearFull).toBeGreaterThan(mid);
    expect(nearFull).toBeLessThan(1);
  });
});
