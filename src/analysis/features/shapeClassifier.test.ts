import { describe, expect, it } from "vitest";
import { classifyComponentShapes } from "./shapeClassifier";
import type { ConnectedComponent } from "@/utils/segmentation";
import { emptyMoments } from "@/utils/geometry";
import type { LineXHeightBand } from "./common";

const CANVAS_WIDTH = 40;
const CANVAS_HEIGHT = 40;

function makeMask(): Uint8Array {
  return new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
}

function fillRect(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      mask[y * CANVAS_WIDTH + x] = 1;
    }
  }
}

function clearRect(mask: Uint8Array, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      mask[y * CANVAS_WIDTH + x] = 0;
    }
  }
}

function component(id: number, minX: number, minY: number, maxX: number, maxY: number): ConnectedComponent {
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  return { id, minX, minY, maxX, maxY, area, moments: emptyMoments(), lineIndex: 0 };
}

// x-height band spans y=10..20 (height 10) for line 0.
const band: LineXHeightBand = { lineIndex: 0, top: 10, bottom: 20, height: 10 };
const bandByLine = new Map([[0, band]]);

describe("classifyComponentShapes", () => {
  it("buckets a closed ring within the x-height band as x_height_closed_loop", () => {
    const mask = makeMask();
    fillRect(mask, 5, 10, 13, 20); // 9x11 ring border
    clearRect(mask, 7, 12, 11, 18); // hollow center
    const c = component(1, 5, 10, 13, 20);

    const shapes = classifyComponentShapes([c], bandByLine, mask, CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(shapes.get(1)?.bucket).toBe("x_height_closed_loop");
    expect(shapes.get(1)?.hasLoop).toBe(true);
  });

  it("buckets a tall loopless vertical stroke reaching above the band as ascender_stem", () => {
    const mask = makeMask();
    fillRect(mask, 10, 2, 12, 20); // narrow tall stroke, no loop
    const c = component(2, 10, 2, 12, 20);

    const shapes = classifyComponentShapes([c], bandByLine, mask, CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(shapes.get(2)?.bucket).toBe("ascender_stem");
    expect(shapes.get(2)?.hasAscender).toBe(true);
    expect(shapes.get(2)?.hasLoop).toBe(false);
  });

  it("buckets a tiny mark above the band as a dot candidate", () => {
    const mask = makeMask();
    fillRect(mask, 10, 3, 12, 5); // small 3x3 mark well above the band
    const c = component(3, 10, 3, 12, 5);

    const shapes = classifyComponentShapes([c], bandByLine, mask, CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(shapes.get(3)?.bucket).toBe("dot");
  });

  it("buckets a short wide loopless stroke near the top of the band as a crossbar candidate", () => {
    const mask = makeMask();
    fillRect(mask, 5, 9, 20, 11); // wide, short (h=3), positioned near band.top
    const c = component(4, 5, 9, 20, 11);

    const shapes = classifyComponentShapes([c], bandByLine, mask, CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(shapes.get(4)?.bucket).toBe("crossbar_candidate");
  });
});
