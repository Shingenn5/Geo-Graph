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
