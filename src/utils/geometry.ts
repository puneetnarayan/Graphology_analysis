export interface MomentAccumulator {
  count: number;
  sumX: number;
  sumY: number;
  sumXX: number;
  sumYY: number;
  sumXY: number;
}

export function emptyMoments(): MomentAccumulator {
  return { count: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 };
}

export function addPoint(m: MomentAccumulator, x: number, y: number): void {
  m.count += 1;
  m.sumX += x;
  m.sumY += y;
  m.sumXX += x * x;
  m.sumYY += y * y;
  m.sumXY += x * y;
}

/**
 * Principal-axis angle (radians, measured from vertical, positive = rightward
 * lean) derived from the covariance matrix of the point set. Used to estimate
 * per-stroke slant.
 */
export function principalAxisAngleFromVertical(m: MomentAccumulator): number | null {
  if (m.count < 4) return null;
  const meanX = m.sumX / m.count;
  const meanY = m.sumY / m.count;
  const cxx = m.sumXX / m.count - meanX * meanX;
  const cyy = m.sumYY / m.count - meanY * meanY;
  const cxy = m.sumXY / m.count - meanX * meanY;

  // Eigenvector of the 2x2 covariance matrix corresponding to the larger eigenvalue.
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  // theta is the angle of the principal axis from the x-axis; convert to
  // "lean from vertical" where 0 = perfectly vertical stroke.
  let fromVertical = Math.PI / 2 - theta;
  // Normalize into (-PI/2, PI/2]
  while (fromVertical > Math.PI / 2) fromVertical -= Math.PI;
  while (fromVertical <= -Math.PI / 2) fromVertical += Math.PI;
  return fromVertical;
}

export function linearRegression(points: { x: number; y: number }[]): {
  slope: number;
  intercept: number;
  residualStdDev: number;
} {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, residualStdDev: 0 };
  const meanX = points.reduce((a, p) => a + p.x, 0) / n;
  const meanY = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const residuals = points.map((p) => p.y - (slope * p.x + intercept));
  const residualStdDev = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);
  return { slope, intercept, residualStdDev };
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
