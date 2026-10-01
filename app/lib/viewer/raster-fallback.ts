import type { AddProtocolAction } from "maplibre-gl";

export function parentTile(z: number, x: number, y: number, level: number) {
  const factor = 2 ** (z - level);
  return { x: Math.floor(x / factor), y: Math.floor(y / factor), factor, column: x % factor, row: y % factor };
}

/** Preserve geographic alignment when high-detail imagery or DEM tiles do not exist. */
export function rasterFallback(template: string, nearest = false): AddProtocolAction {
  const cache = new Map<string, Blob>();
  const missing = new Set<string>();
  const pending = new Map<string, Promise<Blob | null>>();
  function getTile(url: string) {
    let operation = pending.get(url);
    if (!operation) {
      operation = (async () => {
        // A renderer cancelling one tile must not cancel another source's shared download.
        const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (response.status === 404 || response.status === 204) {
          missing.add(url);
          if (missing.size > 512) missing.delete(missing.values().next().value!);
          return null;
        }
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Raster service unavailable");
        const blob = await response.blob();
        cache.set(url, blob);
        if (cache.size > 48) cache.delete(cache.keys().next().value!);
        return blob;
      })().finally(() => pending.delete(url));
      pending.set(url, operation);
    }
    return operation;
  }
  return async (request, controller) => {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean).map(Number);
    const [z, x, y] = parts;
    if (parts.length !== 3 || !parts.every(Number.isInteger) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new Error("Invalid raster tile");
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
    for (let level = z; level >= 0; level--) {
      signal.throwIfAborted();
      const parent = parentTile(z, x, y, level);
      const url = template.replace("{z}", String(level)).replace("{x}", String(parent.x)).replace("{y}", String(parent.y));
      if (missing.has(url)) continue;
      let blob = cache.get(url);
      if (!blob) {
        let abort: (() => void) | undefined;
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
        });
        let downloaded: Blob | null;
        try { downloaded = await Promise.race([getTile(url), cancelled]); }
        finally { signal.removeEventListener("abort", abort!); }
        signal.throwIfAborted();
        if (!downloaded) continue;
        blob = downloaded;
      }
      signal.throwIfAborted();
      if (level === z) return { data: await blob.arrayBuffer() };
      const image = await createImageBitmap(blob, { colorSpaceConversion: "none" });
      try {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d")!;
        // DEM channels encode height: interpolation of RGB bytes corrupts elevations.
        context.imageSmoothingEnabled = !nearest;
        const size = image.width / parent.factor;
        context.drawImage(image, parent.column * size, parent.row * size, size, size, 0, 0, image.width, image.height);
        signal.throwIfAborted();
        return { data: await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer() };
      } finally { image.close(); }
    }
    throw new Error("No raster coverage at this location");
  };
}
