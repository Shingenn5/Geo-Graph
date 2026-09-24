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

export function coordinateQuery(longitude: number, latitude: number) {
  return `lng=${longitude.toFixed(6)}&lat=${latitude.toFixed(6)}`;
}

export async function cachedJson<T>(cache: BoundedCache<unknown>, url: string, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const hit = cache.get(url);
  if (hit !== undefined) return hit as T;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const data = await response.json() as T;
  signal.throwIfAborted();
  if (!response.headers.get("cache-control")?.includes("no-store")) cache.set(url, data);
  return data;
}
