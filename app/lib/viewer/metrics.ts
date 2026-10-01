type Sample = { name: string; milliseconds: number; at: string };
declare global { interface Window { geoGraphMetrics?: { samples: Sample[]; snapshot: () => unknown } } }
export function metricDataKey(name: string) {
  return `gg${name.replace(/[^A-Za-z0-9]+/g, "-").replace(/(^|-)(\w)/g, (_, _prefix, letter) => letter.toUpperCase())}`;
}
/** Bounded local diagnostics; no telemetry leaves the browser. */
export function recordMetric(name: string, started: number) {
  const metrics = window.geoGraphMetrics ??= {
    samples: [],
    snapshot: () => ({ samples: window.geoGraphMetrics?.samples, resources: performance.getEntriesByType("resource").length }),
  };
  const milliseconds = Math.round(performance.now() - started);
  metrics.samples.push({ name, milliseconds, at: new Date().toISOString() });
  // Also expose bounded named timings to browser QA without adding visible UI.
  document.documentElement.dataset[metricDataKey(name)] = String(milliseconds);
  if (name === "terrain-visible") window.dispatchEvent(new Event("gg-terrain-ready"));
  if (metrics.samples.length > 100) metrics.samples.shift();
}
