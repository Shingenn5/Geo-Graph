import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, parseViewerSession, rangeForZoom, zoomForRange } from "./session.ts";

test("viewer state round-trips location, selection, layers, and camera", () => {
  const saved = { ...DEFAULT_VIEW, center: [-110, 40], point: [-109.9, 40.1], surface: "Soil", labels: false };
  assert.deepEqual(parseViewerSession(JSON.stringify(saved)), saved);
  for (const zoom of [2, 6, 10.5, 15]) assert.ok(Math.abs(zoomForRange(rangeForZoom(zoom)) - zoom) < 1e-9);
});

test("corrupt, incompatible, and out-of-range saved state is ignored", () => {
  for (const raw of ["oops", "null", "{}", ...[
    { center: [181, 40] }, { point: [0, 90] }, { zoom: -1 }, { pitch: 90 },
    { bearing: null }, { surface: "invented" }, { labels: "yes" },
  ].map(change => JSON.stringify({ ...DEFAULT_VIEW, ...change }))]) {
    assert.equal(parseViewerSession(raw), null);
  }
});
