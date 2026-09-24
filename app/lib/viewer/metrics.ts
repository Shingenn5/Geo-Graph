type Sample = { name: string; milliseconds: number; at: string };
declare global { interface Window { geoGraphMetrics?: { samples: Sample[]; snapshot: () => unknown } } }
/** Bounded local diagnostics; no telemetry leaves the browser. */
export function recordMetric(name: string, started: number) {
  const metrics = window.geoGraphMetrics ??= {
    samples: [],
    snapshot: () => ({ samples: window.geoGraphMetrics?.samples, resources: performance.getEntriesByType("resource").length }),
  };
  metrics.samples.push({ name, milliseconds: Math.round(performance.now() - started), at: new Date().toISOString() });
  if (metrics.samples.length > 100) metrics.samples.shift();
}
