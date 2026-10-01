import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { offlineSitePlan } from "./offline.ts";
import { ByteCache } from "./cache.ts";

test("binary cache enforces bytes, recency, replacements and oversized entries", () => {
  const cache = new ByteCache<string>(value => value.length, 6, 2);
  cache.set("a", "aaa"); cache.set("b", "bb"); cache.get("a");
  cache.set("c", "ccc"); assert.equal(cache.get("b"), undefined);
  assert.equal(cache.byteLength, 6);
  cache.set("a", "a"); assert.equal(cache.byteLength, 4);
  cache.set("a", "oversized"); assert.equal(cache.get("a"), undefined);
  assert.equal(cache.byteLength, 3);
});

test("site plans are bounded, global and split the antimeridian", () => {
  for (const bbox of [
    {west: 7.1, east: 7.105, south: 9.1, north: 9.105},
    {west: 179.998, east: -179.998, south: -1, north: -0.995},
  ]) {
    const plan = offlineSitePlan(bbox);
    assert.equal(plan.length, new Set(plan).size);
    assert(plan.length <= 524);
    assert.equal(plan.filter(url => url.startsWith("/api/soil?")).length, 5);
    assert(!plan.some(url => url.includes("arcgisonline")));
    assert(plan.some(url => url.includes("/14/")));
  }
  assert.throws(() => offlineSitePlan({west: 0, east: 20, south: 0, north: 20}), /smaller site/);
  assert.throws(() => offlineSitePlan({west: NaN, east: 1, south: 0, north: 1}));
});

async function worker() {
  const listeners = new Map<string, (event: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const stores = new Map<string, Map<string, Response>>();
  let connected = true, status = 200, failStorage = false;
  const key = (value: Request | string) => new URL(typeof value === "string" ? value : value.url, "https://test.local").href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>(); stores.set(name, store);
      return {
        keys: async () => [...store.keys()].map(url => new Request(url)),
        match: async (url: Request | string) => store.get(key(url))?.clone(),
        delete: async (url: Request | string) => store.delete(key(url)),
        put: async (url: Request | string, response: Response) => { if(failStorage)throw new Error("quota"); store.set(key(url), response.clone()); },
      };
    },
  };
  const context = vm.createContext({
    self: {location: {origin: "https://test.local"}, addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), skipWaiting: async () => {}, clients: {claim: async () => {}}},
    caches, Request, Response, Headers, URL, Date, Set, Map, Promise,
    fetch: async () => { if(!connected)throw new Error("offline"); return new Response("data", {status, headers: {"content-type": "application/json"}}); },
  });
  const source = (await readFile(new URL("../../../public/offline-worker.js", import.meta.url), "utf8"))
    .replace("__OFFLINE_VERSION__", "test").replace("/* OFFLINE_ASSETS */ []", '["/"]')
    .replace("const MAX_ENTRIES = 1200", "const MAX_ENTRIES = 3").replace("const MAX_BYTES = 128 * 1024 * 1024", "const MAX_BYTES = 8");
  vm.runInContext(source, context);
  async function lifecycle(name: string) { let pending: Promise<unknown> | undefined; listeners.get(name)!({waitUntil: (p: Promise<unknown>) => {pending=p;}}); await pending; }
  async function request(path: string, headers?: HeadersInit) {
    const pending: Promise<unknown>[] = []; let response: Promise<Response> | undefined;
    listeners.get("fetch")!({request: new Request(new URL(path, "https://test.local"), {headers}), respondWith: (p: Promise<Response>) => {response=p;}, waitUntil: (p: Promise<unknown>) => pending.push(p)});
    const result = await response; await Promise.all(pending); return result;
  }
  async function flush() {
    let ok: boolean | undefined, pending: Promise<unknown> | undefined;
    listeners.get("message")!({data: {type: "GG_FLUSH"}, ports: [{postMessage: (reply: {ok: boolean}) => {ok=reply.ok;}}], waitUntil: (p: Promise<unknown>) => {pending=p;}});
    await pending; return ok;
  }
  return {stores, request, flush, lifecycle, offline: () => {connected=false;}, outage: () => {status=502;}, quota: () => {failStorage=true;}};
}

test("offline worker reopens downloaded app and evidence, never inventing missing records", async () => {
  const sw = await worker(); await sw.lifecycle("install"); await sw.lifecycle("activate");
  await sw.request("/api/soil?lat=1&lng=1"); assert.equal(await sw.flush(), true);
  sw.offline();
  assert.equal(await (await sw.request("/"))!.text(), "data");
  const saved = (await sw.request("/api/soil?lat=1&lng=1"))!;
  assert.equal(saved.headers.get("x-geograph-offline"), "true");
  assert(saved.headers.get("x-geograph-saved-at"));
  const missing = (await sw.request("/api/soil?lat=2&lng=2"))!;
  assert.equal(missing.status, 503); assert.equal(missing.headers.get("x-geograph-offline-miss"), "true");
  assert.equal(await sw.request("/api/soil?lat=1&lng=1", {authorization: "Bearer secret"}), undefined);
});

test("offline worker bounds storage, reports quota errors, and preserves live HTTP failures", async () => {
  const sw = await worker();
  for (let n=0;n<4;n++)await sw.request(`/api/geology?n=${n}`);
  const stored = sw.stores.get("gg-geographic-data-v1")!;
  assert.equal(stored.size, 2); assert(!stored.has("https://test.local/api/geology?n=0"));
  sw.outage(); assert.equal((await sw.request("/api/geology?n=3"))!.status, 502);
  const quota = await worker(); quota.quota(); await quota.request("/api/soil"); assert.equal(await quota.flush(), false);
});
