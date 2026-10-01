import type { ParsedWellLog } from "./las.ts";

/** Min/max decimation retains spikes without connecting across missing or invalid depth rows. */
export function buildLogTrack(log: ParsedWellLog, curve: number, buckets = 400) {
  const count = Math.max(1, Math.min(1000, Math.floor(buckets) || 400));
  const stride = Math.max(1, Math.ceil(log.rows.length / count));
  const issues = new Set(log.depthIssues.map(issue => issue.row - 1));
  type Point = { index: number; value: number; depth: number; segment: number };
  const points: Point[] = [];
  let minValue = Infinity, maxValue = -Infinity, minDepth = Infinity, maxDepth = -Infinity;
  let segment = 0, validRows = 0;
  for (let offset = 0; offset < log.rows.length; offset += stride) {
    let first: Point | null = null, last: Point | null = null;
    let low: Point | null = null, high: Point | null = null;
    for (let index = offset; index < Math.min(offset + stride, log.rows.length); index++) {
      const row = log.rows[index], value = row.values[curve];
      minDepth = Math.min(minDepth, row.depth); maxDepth = Math.max(maxDepth, row.depth);
      if (issues.has(index)) segment++;
      if (value == null || !Number.isFinite(value)) { segment++; continue; }
      const point = { index, value, depth: row.depth, segment };
      validRows++;
      minValue = Math.min(minValue, value); maxValue = Math.max(maxValue, value);
      first ??= point; last = point;
      if (!low || value < low.value) low = point;
      if (!high || value > high.value) high = point;
    }
    const candidates = [first, low, high, last].filter((point): point is Point => point !== null);
    points.push(...[...new Map(candidates.map(point => [point.index, point])).values()].sort((a, b) => a.index - b.index));
  }
  if (!validRows) return null;
  let path = "", previousSegment: number | null = null;
  for (const point of points) {
    const x = 8 + (maxValue === minValue ? 0.5 : (point.value - minValue) / (maxValue - minValue)) * 144;
    const y = 8 + (maxDepth === minDepth ? 0.5 : (point.depth - minDepth) / (maxDepth - minDepth)) * 484;
    path += `${previousSegment === point.segment ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)} `;
    previousSegment = point.segment;
  }
  return { path, minValue, maxValue, minDepth, maxDepth, validRows, plottedRows: points.length };
}
