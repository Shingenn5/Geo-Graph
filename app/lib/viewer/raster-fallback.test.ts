import test from "node:test";
import assert from "node:assert/strict";
import { parentTile, rasterFallback } from "./raster-fallback.ts";

test("missing tile crops its exact geographic quadrant", () => {
  assert.deepEqual(parentTile(18, 228575, 149562, 17), { x: 114287, y: 74781, factor: 2, column: 1, row: 0 });
  assert.deepEqual(parentTile(17, 114287, 74781, 12), { x: 3571, y: 2336, factor: 32, column: 15, row: 29 });
});

test("shared raster downloads survive another consumer's cancellation", async () => {
  const original = globalThis.fetch;
  let resolve!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise<Response>(done => { resolve = done; }); };
  try {
    const load = rasterFallback("https://example.org/{z}/{x}/{y}");
    const cancelled = new AbortController();
    const first = load({ url: "ggterrain://tiles/12/3571/2336" }, cancelled);
    const second = load({ url: "ggterrain://tiles/12/3571/2336" }, new AbortController());
    cancelled.abort();
    await assert.rejects(first);
    assert.equal(calls, 1);
    resolve(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    assert.deepEqual(new Uint8Array((await second).data), new Uint8Array([1, 2, 3]));
  } finally { globalThis.fetch = original; }
});

test("raster outages and cancellation do not fall through to fabricated coverage", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("outage", { status: 503 }); };
  try {
    const load = rasterFallback("https://example.org/{z}/{x}/{y}");
    await assert.rejects(load({ url: "ggterrain://tiles/12/3571/2336" }, new AbortController()), /unavailable/);
    assert.equal(calls, 1);
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(load({ url: "ggterrain://tiles/12/3571/2336" }, aborted));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("cached buffers survive renderer transfer and avoid repeated processing", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {calls++;return new Response(new Uint8Array([7,8,9]), {headers: {"content-type": "image/png"}});};
  try {
    const load = rasterFallback("https://example.org/{z}/{x}/{y}");
    const first = await load({url: "ggterrain://tiles/1/0/0"}, new AbortController());
    structuredClone(first.data, {transfer: [first.data]});
    assert.equal(first.data.byteLength, 0);
    const second = await load({url: "ggterrain://tiles/1/0/0"}, new AbortController());
    assert.deepEqual([...new Uint8Array(second.data)], [7,8,9]); assert.equal(calls,1);
  } finally {globalThis.fetch=original;}
});

test("an offline cache miss can be downloaded after reconnecting", async () => {
  const original = globalThis.fetch; let online = false;
  globalThis.fetch = async () => online
    ? new Response(new Uint8Array([1]), {headers: {"content-type": "image/png"}})
    : new Response("not downloaded", {status:503, headers: {"x-geograph-offline-miss": "true"}});
  try {
    const load = rasterFallback("https://example.org/{z}/{x}/{y}");
    await assert.rejects(load({url: "ggterrain://tiles/0/0/0"},new AbortController()), /No raster coverage/);
    online=true;
    assert.equal((await load({url: "ggterrain://tiles/0/0/0"},new AbortController())).data.byteLength,1);
  } finally {globalThis.fetch=original;}
});
