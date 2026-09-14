let counter = 0;

/** Deterministic-enough sequential ID generator for a single analysis run (not crypto-random). */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(4, "0")}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

export function evidenceId(n: number): string {
  return `E${n.toString().padStart(3, "0")}`;
}
