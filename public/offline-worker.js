/* Saved app files and public geographic data only; never cache credentials. */
const VERSION = "__OFFLINE_VERSION__";
const PRECACHE = /* OFFLINE_ASSETS */ [];
const SHELL = `gg-shell-${VERSION}`;
const DATA = "gg-geographic-data-v1";
const MAX_ENTRIES = 1200;
const MAX_BYTES = 128 * 1024 * 1024;
const HOSTS = new Set(["tiles.mapterhorn.com", "tiles.openfreemap.org", "maps.isric.org", "s3.amazonaws.com", "earthquake.usgs.gov"]);
let writes = Promise.resolve();
const pendingStores = new Set();
let index;
let totalBytes = 0;
let storageFailed = false;
async function storageIndex(cache) {
  if (index) return;
  index = new Map();
  for (const key of await cache.keys()) {
    const response = await cache.match(key);
    const bytes = Number(response?.headers.get("x-geograph-bytes")) || 0;
    index.set(key.url, bytes); totalBytes += bytes;
  }
}

self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(SHELL);
  // Background installation has bounded parallelism; it follows initial terrain loading.
  const queue = [...PRECACHE];
  await Promise.all(Array.from({length: 3}, async () => {
    while (queue.length) {
      const url = queue.shift();
      const response = await fetch(url, {cache: "reload"});
      if (!response.ok) throw new Error(`Offline app file unavailable: ${url}`);
      await cache.put(url, response);
    }
  }));
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("gg-shell-") && name !== SHELL) await caches.delete(name);
  await self.clients.claim();
})()));

function eligible(request) {
  if (request.method !== "GET" || request.headers.has("authorization")) return false;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return /^\/api\/(soil|geology|tiles|wells|provenance|location|relief|core)(\/|$)/.test(url.pathname);
  return HOSTS.has(url.hostname);
}
async function store(request, response) {
  if (!response.ok || response.type === "opaque" || /no-store|private/i.test(response.headers.get("cache-control") || "")) return;
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return;
  const headers = new Headers(response.headers);
  headers.set("x-geograph-saved-at", new Date().toISOString());
  headers.set("x-geograph-bytes", String(bytes.byteLength));
  // Headers describing compressed transport no longer describe the stored bytes.
  headers.delete("content-encoding"); headers.delete("content-length");
  const snapshot = new Response(bytes, {status: response.status, headers});
  writes = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(DATA);
    await storageIndex(cache);
    const key = request.url;
    const previous = index.get(key) || 0;
    await cache.delete(request);
    totalBytes -= previous; index.delete(key);
    await cache.put(request, snapshot);
    index.set(key, bytes.byteLength); totalBytes += bytes.byteLength;
    while (index.size > MAX_ENTRIES || totalBytes > MAX_BYTES) {
      const oldest = index.keys().next().value;
      await cache.delete(oldest);
      totalBytes -= index.get(oldest); index.delete(oldest);
    }
  });
  return writes;
}
function savedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("x-geograph-offline", "true");
  headers.set("cache-control", "no-store");
  return new Response(response.body, {status: response.status, headers});
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const local = url.origin === self.location.origin;
  const appFile = local && (PRECACHE.includes(url.pathname) || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/maplibre/"));
  if (request.mode === "navigate" && local && ["/", "/viewer"].includes(url.pathname)) {
    event.respondWith((async () => (await caches.open(SHELL)).match(url.pathname).then(response => response || fetch(request)))());
  } else if (appFile) {
    event.respondWith((async () => (await caches.open(SHELL)).match(url.pathname).then(response => response || fetch(request)))());
  } else if (eligible(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA);
      const saved = await cache.match(request);
      const api = local && !/^\/api\/(tiles|relief)\//.test(url.pathname);
      // Raster/vector tiles are immutable enough to reuse for seven days. Evidence
      // still checks its source online; an offline snapshot keeps its saved timestamp.
      if (saved && self.navigator?.onLine === false) return savedResponse(saved);
      if (saved && !api && Date.now() - Date.parse(saved.headers.get("x-geograph-saved-at")) < 7 * 86400000) return saved;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const pending = store(request, response).catch(() => { storageFailed = true; });
          pendingStores.add(pending);
          event.waitUntil(pending.finally(() => pendingStores.delete(pending)));
        }
        return response;
      } catch {
        if (saved) return savedResponse(saved);
        return new Response("No downloaded data for this location", {status: 503, headers: {"x-geograph-offline-miss": "true", "cache-control": "no-store"}});
      }
    })());
  }
});
self.addEventListener("message", event => {
  if (event.data?.type !== "GG_FLUSH") return;
  event.waitUntil((async () => {
    await Promise.all([...pendingStores]);
    try { await writes; } catch { storageFailed = true; }
    const cache = await caches.open(DATA);
    let saved = 0, terrainTiles = 0;
    for (const value of event.data.urls || []) {
      const url = new URL(value, self.location.origin);
      if (await cache.match(url.href)) {saved++; if(url.hostname === "tiles.mapterhorn.com")terrainTiles++;}
    }
    event.ports[0]?.postMessage({ok: !storageFailed, saved, terrainTiles});
    storageFailed = false;
  })());
});
