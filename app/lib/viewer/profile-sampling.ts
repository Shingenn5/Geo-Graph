import * as C from "cesium";

/** Isolate profile requests so cancellation never touches visible globe tiles. */
export async function sampleProfileTerrain(
  provider: C.TerrainProvider,
  level: number,
  positions: C.Cartographic[],
  signal: AbortSignal,
  timeoutMs = 20_000,
): Promise<C.Cartographic[]> {
  signal.throwIfAborted();
  const requests = new Set<C.Request>();
  const deadline = new AbortController();
  const jobSignal = AbortSignal.any([signal, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new Error("Terrain sampling timed out. Draw again to retry.")), timeoutMs);
  let rejectAborted: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAborted = reject; });
  function cancel() {
    // Cesium 1.145 exposes cancellation on Request at runtime but omits it from
    // its public declarations. Keep this adapter isolated and covered by tests.
    for (const request of requests) (request as C.Request & { cancel(): void }).cancel();
    rejectAborted(jobSignal.reason);
  }
  jobSignal.addEventListener("abort", cancel, { once: true });
  const samplingProvider = new Proxy(provider, {
    get(target, property) {
      if (property !== "requestTileGeometry") return Reflect.get(target, property, target);
      return (x: number, y: number, tileLevel: number) => {
        if (jobSignal.aborted) return Promise.reject(jobSignal.reason);
        const request = new C.Request({ throttle: false, throttleByServer: false, type: C.RequestType.TERRAIN });
        requests.add(request);
        try {
          const tile = target.requestTileGeometry(x, y, tileLevel, request);
          if (!tile) { requests.delete(request); return undefined; }
          // Settle sampling even when the transport never acknowledges cancellation.
          return Promise.race([tile, aborted]).finally(() => requests.delete(request));
        } catch (error) {
          requests.delete(request);
          throw error;
        }
      };
    },
  });
  try {
    // Uncovered positions must not retain Cartographic's default zero height.
    for (const position of positions) position.height = Number.NaN;
    return await Promise.race([C.sampleTerrain(samplingProvider, level, positions, false), aborted]);
  } finally {
    clearTimeout(timer);
    jobSignal.removeEventListener("abort", cancel);
  }
}
