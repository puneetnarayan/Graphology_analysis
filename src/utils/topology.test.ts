import { describe, expect, it } from "vitest";
import { detectEnclosedHoles } from "./topology";

function emptyMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

function fillRect(mask: Uint8Array, width: number, x0: number, y0: number, x1: number, y1: number, value: 0 | 1) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      mask[y * width + x] = value;
    }
  }
}

describe("detectEnclosedHoles", () => {
  it("finds no holes in a solid filled square", () => {
    const width = 7;
    const height = 7;
    const mask = emptyMask(width, height);
    fillRect(mask, width, 1, 1, 5, 5, 1);

    const holes = detectEnclosedHoles(mask, width, height, 1, 1, 5, 5);
    expect(holes.holeCount).toBe(0);
  });

  it("finds one hole in a closed ring (like the letter 'o')", () => {
    const width = 9;
    const height = 9;
    const mask = emptyMask(width, height);
    // Draw a 7x7 ring border (1px thick) with a hollow 5x5 center.
    fillRect(mask, width, 1, 1, 7, 7, 1);
    fillRect(mask, width, 2, 2, 6, 6, 0);

    const holes = detectEnclosedHoles(mask, width, height, 1, 1, 7, 7);
    expect(holes.holeCount).toBe(1);
    expect(holes.totalHoleArea).toBe(25);
  });

  it("finds no holes when the ring has a gap (like an open 'c')", () => {
    const width = 9;
    const height = 9;
    const mask = emptyMask(width, height);
    fillRect(mask, width, 1, 1, 7, 7, 1);
    fillRect(mask, width, 2, 2, 6, 6, 0);
    // Cut a gap through the ring so the center connects to the outside.
    fillRect(mask, width, 4, 1, 4, 3, 0);

    const holes = detectEnclosedHoles(mask, width, height, 1, 1, 7, 7);
    expect(holes.holeCount).toBe(0);
  });

  it("ignores tiny noise-sized pockets below the significance threshold", () => {
    const width = 20;
    const height = 20;
    const mask = emptyMask(width, height);
    fillRect(mask, width, 1, 1, 15, 15, 1);
    // A single-pixel background speck inside a large solid block should not
    // register as a meaningful loop.
    mask[8 * width + 8] = 0;

    const holes = detectEnclosedHoles(mask, width, height, 1, 1, 15, 15);
    expect(holes.holeCount).toBe(0);
  });
});
