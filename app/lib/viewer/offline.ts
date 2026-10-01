import { areaSamplePoints, type AreaBbox } from "../selection/area-evidence.ts";
import { coordinateQuery } from "./cache.ts";

let registration: Promise<ServiceWorkerRegistration> | undefined;
export function prepareOfflineApp() {
  if (!("serviceWorker" in navigator)) return Promise.reject(new Error("Offline download needs HTTPS or localhost in a supported browser."));
  registration ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          const candidate = await navigator.serviceWorker.register("/offline-worker.js", {scope: "/"});
          if(candidate.active)await candidate.update();
          const installing = candidate.installing ?? candidate.waiting;
          if (installing && installing.state !== "activated") await new Promise<void>((resolve, reject) => {
            const changed = () => {
              if (installing.state === "activated" || installing.state === "redundant") {
                installing.removeEventListener("statechange", changed);
                if(installing.state === "activated")resolve();
                else reject(new Error("App files could not be downloaded. Check your connection and storage."));
              }
            };
            installing.addEventListener("statechange", changed); changed();
          });
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {once: true}));
        })(),
        new Promise<never>((_, reject) => {timer = setTimeout(() => reject(new Error("App download did not finish. Check your connection and browser storage, then try again.")), 60000);}),
      ]);
      return await navigator.serviceWorker.ready;
    } finally { clearTimeout(timer); }
  })().catch(cause => { registration = undefined; throw cause; });
  return registration;
}

/** Small terrain packs; no bulk extraction of licensed satellite imagery. */
export function offlineSitePlan(bbox: AreaBbox) {
  const samples = areaSamplePoints(bbox);
  const urls = new Set<string>();
  const tileX = (longitude: number, z: number) => Math.max(0, Math.min(2 ** z - 1, Math.floor((longitude + 180) / 360 * 2 ** z)));
  const tileY = (latitude: number, z: number) => Math.max(0, Math.min(2 ** z - 1, Math.floor((1 - Math.asinh(Math.tan(Math.max(-85.051, Math.min(85.051, latitude)) * Math.PI / 180)) / Math.PI) / 2 * 2 ** z)));
  const segments = bbox.east >= bbox.west ? [[bbox.west, bbox.east]] : [[bbox.west, 180], [-180, bbox.east]];
  let tiles = 0;
  for (let z = 0; z <= 14; z++) for (const [west, east] of segments) {
    // Include surrounding tiles for the tilted camera and hillshade source.
    const padding = z >= 10 ? 1 : 0;
    const minX = Math.max(0, tileX(west, z) - padding), maxX = Math.min(2 ** z - 1, tileX(east, z) + padding);
    const minY = Math.max(0, tileY(bbox.north, z) - padding), maxY = Math.min(2 ** z - 1, tileY(bbox.south, z) + padding);
    tiles += (maxX - minX + 1) * (maxY - minY + 1);
    if (tiles > 256) throw new Error("Choose a smaller site for an offline terrain download (maximum 256 terrain tiles). Whole-country packs are not supported yet.");
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      urls.add(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`);
      urls.add(`/api/tiles/${z}/${x}/${y}`);
    }
  }
  for (const sample of samples) for (const domain of ["soil", "geology"])
    urls.add(`/api/${domain}?${coordinateQuery(sample.longitude, sample.latitude)}`);
  for (const domain of ["wells", "provenance"])
    urls.add(`/api/${domain}?${coordinateQuery(samples[0].longitude, samples[0].latitude)}${domain==="wells"?"&radiusKm=15&limit=12":""}`);
  return [...urls];
}

export async function downloadOfflineSite(bbox: AreaBbox, onProgress: (message: string) => void) {
  const urls = offlineSitePlan(bbox);
  if (!navigator.onLine) throw new Error("Connect to the internet to download a new site.");
  onProgress("Downloading the app files…");
  await prepareOfflineApp();
  let done = 0;
  const queue = [...urls];
  await Promise.all(Array.from({length: 3}, async () => {
    while (queue.length) {
      const url = queue.shift()!;
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(25000)});
        await response.arrayBuffer();
      } catch { /* Missing and failed responses are counted from persisted storage below. */ }
      onProgress(`Downloading site: ${++done} / ${urls.length} requests`);
    }
  }));
  const stored = await new Promise<{saved: number; terrainTiles: number}>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => reject(new Error("Offline storage did not finish. Try again.")), 30000);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); if(event.data?.ok)resolve(event.data);else reject(new Error("Browser storage could not save the download. Free some space and try again.")); };
    navigator.serviceWorker.controller!.postMessage({type: "GG_FLUSH", urls}, [channel.port2]);
  });
  if (stored.saved === 0 || stored.terrainTiles === 0) throw new Error("No site data could be downloaded. Reconnect and try again.");
  return {downloaded: stored.saved, unavailable: urls.length - stored.saved, terrainTiles: stored.terrainTiles};
}
