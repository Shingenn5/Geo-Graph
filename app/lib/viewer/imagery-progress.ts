import type { ImageryProvider, Rectangle } from "cesium";

/** Observe the public requestImage API, without accessing Cesium private tile queues. */
export function trackImagery(provider: ImageryProvider) {
  const successful = new Map<string, Rectangle>();
  let pending = 0;
  let changedAt = performance.now();
  const requestImage = provider.requestImage.bind(provider);
  provider.requestImage = (x, y, level, request) => {
    const result = requestImage(x, y, level, request);
    if (!result) return result;
    pending++; changedAt = performance.now();
    return Promise.resolve(result).then(image => {
      // Entirely transparent WMS tiles are valid responses, but not useful coverage.
      let visible = true;
      if (image instanceof HTMLImageElement || image instanceof ImageBitmap || image instanceof HTMLCanvasElement) {
        try {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 8;
          const context = canvas.getContext("2d", { willReadFrequently: true })!;
          context.drawImage(image, 0, 0, 8, 8);
          const pixels = context.getImageData(0, 0, 8, 8).data;
          visible = pixels.some((value, index) => index % 4 === 3 && value > 0);
        } catch { visible = true; }
      }
      if (visible) {
        const key = `${level}/${x}/${y}`;
        successful.delete(key); successful.set(key, provider.tilingScheme.tileXYToRectangle(x, y, level));
        while (successful.size > 128) successful.delete(successful.keys().next().value!);
      }
      return image;
    }).finally(() => { pending--; changedAt = performance.now(); });
  };
  return {
    ready(longitude: number, latitude: number) {
      if (pending || performance.now() - changedAt < 120) return false;
      return [...successful.values()].some(rectangle => latitude >= rectangle.south && latitude <= rectangle.north && (rectangle.west <= rectangle.east ? longitude >= rectangle.west && longitude <= rectangle.east : longitude >= rectangle.west || longitude <= rectangle.east));
    },
  };
}
