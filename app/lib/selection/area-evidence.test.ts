import assert from "node:assert/strict";
import test from "node:test";
import { areaSamplePoints, collectAreaEvidence } from "./area-evidence.ts";

test("samples center and inset corners deterministically", () => {
  assert.deepEqual(areaSamplePoints({ west: -100, south: 30, east: -90, north: 40 }), [
    { id: "center", longitude: -95, latitude: 35 },
    { id: "northwest", longitude: -99, latitude: 39 },
    { id: "northeast", longitude: -91, latitude: 39 },
    { id: "southwest", longitude: -99, latitude: 31 },
    { id: "southeast", longitude: -91, latitude: 31 },
  ]);
});

test("keeps no-record distinct from failures and retains point provenance", async () => {
  const result = await collectAreaEvidence({ west: 1, south: 1, east: 2, north: 2 }, async (domain, point) => {
    if (point.id === "center" && domain === "soil") throw new Error("timeout");
    return point.id === "northwest"
      ? { status: "no-record", source: "SSURGO", retrievedAt: "2026-09-22T00:00:00Z" }
      : { status: "available", source: domain === "soil" ? "SSURGO" : "Macrostrat", data: { at: point.id } };
  });
  assert.equal(result.sampling.coverageClaim, "point-samples-only");
  assert.equal(result.aggregate.soil.unavailable, 1);
  assert.equal(result.aggregate.soil.noRecord, 1);
  assert.equal(result.aggregate.geology.available, 4);
  assert.equal(result.samples[0].soil.error, "timeout");
  assert.equal(result.samples[1].soil.retrievedAt, "2026-09-22T00:00:00Z");
});

test("supports antimeridian bounds and rejects oversized spans", () => {
  const points = areaSamplePoints({ west: 179, south: -1, east: -179, north: 1 });
  assert.equal(points[0].longitude, 180);
  assert.ok(points.every(point => Math.abs(point.longitude) >= 179));
  assert.throws(() => areaSamplePoints({ west: -100, south: 0, east: 100, north: 1 }), RangeError);
});
