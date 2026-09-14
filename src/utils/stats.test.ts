import { describe, expect, it } from "vitest";
import { mean, median, stdDev, clamp, coefficientOfVariation } from "./stats";

describe("stats", () => {
  it("computes mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([])).toBe(0);
  });

  it("computes median for even and odd length arrays", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("computes population standard deviation", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 1);
    expect(stdDev([5])).toBe(0);
  });

  it("clamps values within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns 0 coefficient of variation when mean is 0", () => {
    expect(coefficientOfVariation([0, 0, 0])).toBe(0);
  });
});
