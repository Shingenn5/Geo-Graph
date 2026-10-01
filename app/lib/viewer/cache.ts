/** Small per-viewer cache. Never caches errors or abandoned requests. */
export class BoundedCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  private capacity: number;
  private ttlMs: number;
  constructor(capacity = 48, ttlMs = 300_000) { this.capacity=capacity;this.ttlMs=ttlMs; }
  get(key: string): T | undefined {
    const item = this.entries.get(key);
    if (!item) return undefined;
    this.entries.delete(key);
    if (item.expires <= Date.now()) return undefined;
    this.entries.set(key, item);
    return item.value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  get size() { return this.entries.size; }
}

/** Bound binary tile storage by bytes as well as entry count. */
export class ByteCache<T> {
  private entries = new Map<string, { value: T; bytes: number }>();
  private bytes = 0;
  private measure: (value: T) => number;
  private maxBytes: number;
  private capacity: number;
  constructor(measure: (value: T) => number, maxBytes = 16 * 1024 * 1024, capacity = 48) { this.measure = measure; this.maxBytes = maxBytes; this.capacity = capacity; }
  get(key: string) {
    const item = this.entries.get(key);
    if (!item) return undefined;
    this.entries.delete(key); this.entries.set(key, item);
    return item.value;
  }
  set(key: string, value: T) {
    const previous = this.entries.get(key);
    if (previous) { this.bytes -= previous.bytes; this.entries.delete(key); }
    const bytes = this.measure(value);
    if (bytes > this.maxBytes) return;
    this.entries.set(key, { value, bytes }); this.bytes += bytes;
    while (this.bytes > this.maxBytes || this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
    }
  }
  get byteLength() { return this.bytes; }
  get size() { return this.entries.size; }
}

export function coordinateQuery(longitude: number, latitude: number) {
  return `lng=${longitude.toFixed(6)}&lat=${latitude.toFixed(6)}`;
}

export type OfflineSnapshot = { offlineSnapshot?: { savedAt: string | null } };

export async function cachedJson<T>(cache: BoundedCache<unknown>, url: string, signal: AbortSignal): Promise<T & OfflineSnapshot> {
  signal.throwIfAborted();
  const hit = cache.get(url);
  if (hit !== undefined) return hit as T & OfflineSnapshot;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const data = await response.json() as T & OfflineSnapshot;
  if (response.headers.get("x-geograph-offline") === "true" && data && typeof data === "object") data.offlineSnapshot = { savedAt: response.headers.get("x-geograph-saved-at") };
  signal.throwIfAborted();
  if (!response.headers.get("cache-control")?.includes("no-store")) cache.set(url, data);
  return data;
}
