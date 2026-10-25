import type { CadShape } from "./types";

const quantiles = (values: number[]) => {
  values.sort((a, b) => a - b);
  return Array.from({ length: 12 }, (_, i) => values[Math.floor((values.length - 1) * (i + .5) / 12)] ?? 0);
};

/** A small PCA and distance signature, independent of placement and mesh names. */
export function describeCadShape(points: readonly number[]): CadShape {
  const count = points.length / 3;
  if (count < 3) return { dimensions: [0, 0, 0], radial: [], pairs: [] };
  const center = [0, 0, 0];
  for (let i = 0; i < points.length; i++) center[i % 3]! += points[i]! / count;
  const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < points.length; i += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    matrix[a]![b]! += (points[i + a]! - center[a]!) * (points[i + b]! - center[b]!) / count;
  }
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let pass = 0; pass < 24; pass++) {
    let p = 0, q = 1;
    for (const [a, b] of [[0, 2], [1, 2]]) if (Math.abs(matrix[a!]![b!]!) > Math.abs(matrix[p]![q]!)) { p = a!; q = b!; }
    if (Math.abs(matrix[p]![q]!) < 1e-15) break;
    const angle = .5 * Math.atan2(2 * matrix[p]![q]!, matrix[q]![q]! - matrix[p]![p]!);
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let k = 0; k < 3; k++) {
      const a = matrix[k]![p]!, b = matrix[k]![q]!;
      matrix[k]![p] = c * a - s * b; matrix[k]![q] = s * a + c * b;
    }
    for (let k = 0; k < 3; k++) {
      const a = matrix[p]![k]!, b = matrix[q]![k]!;
      matrix[p]![k] = c * a - s * b; matrix[q]![k] = s * a + c * b;
      const x = axes[k]![p]!, y = axes[k]![q]!;
      axes[k]![p] = c * x - s * y; axes[k]![q] = s * x + c * y;
    }
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], radial: number[] = [];
  for (let i = 0; i < count; i++) {
    const v = [0, 1, 2].map((j) => points[i * 3 + j]! - center[j]!);
    radial.push(Math.hypot(...v));
    for (let a = 0; a < 3; a++) {
      const value = v.reduce((sum, value, b) => sum + value * axes[b]![a]!, 0);
      lo[a] = Math.min(lo[a]!, value); hi[a] = Math.max(hi[a]!, value);
    }
  }
  const ordered = hi.map((value, i) => ({ dimension: value - lo[i]!, axis: i })).sort((a, b) => a.dimension - b.dimension);
  const dimensions = ordered.map((entry) => entry.dimension), short = ordered[0]!.axis, long = ordered[2]!.axis;
  const scale = dimensions[2]! || 1;
  const pairs: number[] = [];
  for (let i = 0; i < Math.min(count, 512); i++) {
    const a = Math.floor(i * count / Math.min(count, 512)), b = (a * 73 + 29) % count;
    pairs.push(Math.hypot(...[0, 1, 2].map((j) => points[a * 3 + j]! - points[b * 3 + j]!)) / scale);
  }
  return { dimensions, radial: quantiles(radial.map((v) => v / scale)), pairs: quantiles(pairs), shortAxis: { x: axes[0]![short]!, y: axes[1]![short]!, z: axes[2]![short]! }, longAxis: { x: axes[0]![long]!, y: axes[1]![long]!, z: axes[2]![long]! } };
}

/** Strict physical-size gate; a lookalike box alone is never a reference match. */
export function compareCadShapes(a: CadShape, b: CadShape): number | null {
  if (a.radial.length !== 12 || b.radial.length !== 12) return null;
  const dimensionError = Math.max(...a.dimensions.map((value, i) => Math.abs(value - b.dimensions[i]!) / Math.max(b.dimensions[i]!, .001)));
  if (dimensionError > .055) return null;
  const distributionError = Math.sqrt([...a.radial.map((v, i) => (v - b.radial[i]!) ** 2), ...a.pairs.map((v, i) => (v - b.pairs[i]!) ** 2)].reduce((sum, v) => sum + v, 0) / 24);
  return distributionError <= .035 ? dimensionError + distributionError * 2 : null;
}
