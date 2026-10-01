import test from "node:test";
import assert from "node:assert/strict";
import { globalSoil, gridValue, soilGridQuery } from "./global.ts";

test("global soil conversion preserves zero, masks and invalid values", () => {
  const data = (value: unknown) => ({ type: "FeatureCollection", features: [{ properties: { pixel_value: value } }] });
  assert.equal(gridValue(data(81), "phh2o"), 8.1);
  assert.equal(gridValue(data(774), "sand"), 77.4);
  assert.equal(gridValue(data(0), "clay"), 0);
  assert.equal(gridValue(data(-32768), "phh2o"), null);
  assert.equal(gridValue(data(null), "sand"), null);
  assert.throws(() => gridValue({ error: "outage" }, "sand"));
  const query = new URL(soilGridQuery("phh2o", 133.9, -24.6, "100-200"));
  assert.equal(query.searchParams.get("QUERY_LAYERS"), "phh2o_100-200cm_mean");
  assert.equal(query.searchParams.get("SRS"), "EPSG:4326");
});

test("global profiles retain requested depths, derived provenance and bounded concurrency", async () => {
  const original = globalThis.fetch;
  let running = 0, peak = 0;
  globalThis.fetch = async input => {
    running++; peak = Math.max(peak, running);
    await new Promise(resolve => setTimeout(resolve, 2));
    running--;
    const query = new URL(String(input));
    const layer = query.searchParams.get("QUERY_LAYERS")!;
    return Response.json({ type: "FeatureCollection", features: [{ id: "template-id", properties: { pixel_value: layer.includes("100-200") ? 85 : 70 } }] });
  };
  try {
    const result = await globalSoil(133.9, -24.6);
    assert.equal(result.soil?.evidenceKind, "derived");
    assert.equal(result.soil?.horizons[5].ph, 8.5);
    assert.equal(result.soil?.horizons[5].sandPercent, null);
    assert.equal(result.soil?.horizonBottomCm, 5);
    assert.ok(peak <= 4);
  } finally { globalThis.fetch = original; }
});

test("global no-pixel results differ from service outages", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("\n\n", { status: 200 });
    assert.equal((await globalSoil(0, 0)).soil, null);
    globalThis.fetch = async () => new Response("outage", { status: 503 });
    await assert.rejects(globalSoil(0, 0), /unavailable/);
  } finally { globalThis.fetch = original; }
});
