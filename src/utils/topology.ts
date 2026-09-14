/**
 * Enclosed-hole ("loop") detection for a connected ink component.
 *
 * This is genuine topology, not a shape heuristic: background pixels inside
 * a component's bounding box that cannot reach the box border without
 * crossing ink are enclosed loops (the ring of an "o", the bowl of a "b",
 * the counter of an "a"). It says nothing about which letter produced the
 * loop — that still requires OCR — but it is a reliable, letter-agnostic
 * signal for "does this stroke enclose a pocket of background".
 */

export interface HoleInfo {
  holeCount: number;
  totalHoleArea: number;
  largestHoleAreaRatio: number; // largest hole area / bbox area
}

const EMPTY: HoleInfo = { holeCount: 0, totalHoleArea: 0, largestHoleAreaRatio: 0 };

/** Safety cap on the local window size to bound worst-case flood-fill cost. */
const MAX_WINDOW_PIXELS = 250_000;

export function detectEnclosedHoles(
  mask: Uint8Array,
  width: number,
  height: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): HoleInfo {
  const pad = 1;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width - 1, maxX + pad);
  const y1 = Math.min(height - 1, maxY + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 2 || h <= 2 || w * h > MAX_WINDOW_PIXELS) return EMPTY;

  const isBackground = (gx: number, gy: number) => mask[gy * width + gx] === 0;
  const idx = (lx: number, ly: number) => ly * w + lx;

  const reachable = new Uint8Array(w * h);
  const stack: number[] = [];

  const seed = (lx: number, ly: number) => {
    if (!isBackground(x0 + lx, y0 + ly)) return;
    const i = idx(lx, ly);
    if (reachable[i]) return;
    reachable[i] = 1;
    stack.push(i);
  };
  for (let lx = 0; lx < w; lx += 1) {
    seed(lx, 0);
    seed(lx, h - 1);
  }
  for (let ly = 0; ly < h; ly += 1) {
    seed(0, ly);
    seed(w - 1, ly);
  }

  while (stack.length > 0) {
    const cur = stack.pop()!;
    const lx = cur % w;
    const ly = (cur - lx) / w;
    const neighbors: [number, number][] = [
      [lx - 1, ly],
      [lx + 1, ly],
      [lx, ly - 1],
      [lx, ly + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!isBackground(x0 + nx, y0 + ny)) continue;
      const ni = idx(nx, ny);
      if (reachable[ni]) continue;
      reachable[ni] = 1;
      stack.push(ni);
    }
  }

  // Any background cell not reached from the window border is enclosed.
  const holeLabel = new Int32Array(w * h).fill(-1);
  const holeAreas: number[] = [];
  for (let ly = 0; ly < h; ly += 1) {
    for (let lx = 0; lx < w; lx += 1) {
      const li = idx(lx, ly);
      if (reachable[li] || holeLabel[li] !== -1) continue;
      if (!isBackground(x0 + lx, y0 + ly)) continue;

      let area = 0;
      const holeStack = [li];
      holeLabel[li] = holeAreas.length;
      while (holeStack.length > 0) {
        const c = holeStack.pop()!;
        area += 1;
        const cx = c % w;
        const cy = (c - cx) / w;
        const neighbors: [number, number][] = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = idx(nx, ny);
          if (holeLabel[ni] !== -1 || reachable[ni]) continue;
          if (!isBackground(x0 + nx, y0 + ny)) continue;
          holeLabel[ni] = holeAreas.length;
          holeStack.push(ni);
        }
      }
      holeAreas.push(area);
    }
  }

  if (holeAreas.length === 0) return EMPTY;

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const minHoleArea = Math.max(2, bboxArea * 0.02);
  const significant = holeAreas.filter((a) => a >= minHoleArea);
  if (significant.length === 0) return EMPTY;

  const totalHoleArea = significant.reduce((a, b) => a + b, 0);
  const largestHoleArea = Math.max(...significant);

  return {
    holeCount: significant.length,
    totalHoleArea,
    largestHoleAreaRatio: bboxArea > 0 ? largestHoleArea / bboxArea : 0,
  };
}
