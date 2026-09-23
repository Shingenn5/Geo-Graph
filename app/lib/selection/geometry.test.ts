import assert from "node:assert/strict";
import test from "node:test";
import {
  componentBboxes,
  containsPoint,
  createRectangleSelection,
  validateWgs84Ring,
} from "./geometry.ts";

test("builds an ordinary rectangle with a closed GeoJSON ring and WGS84 area units", () => {
  const result = createRectangleSelection([-97, 40], [-96, 41]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.selection.geometry, {
    type: "Polygon",
    coordinates: [[[-97, 40], [-96, 40], [-96, 41], [-97, 41], [-97, 40]]],
  });
  assert.deepEqual(result.selection.bbox.geoJson, [-97, 40, -96, 41]);
  assert.ok(result.selection.area.squareMeters > 9_000_000_000);
  assert.equal(result.selection.area.hectares, result.selection.area.squareMeters / 10_000);
  assert.equal(result.selection.area.acres, result.selection.area.squareMeters / 4_046.8564224);
  assert.equal(result.selection.area.method, "WGS84 ellipsoid surface integral over latitude/longitude bounds");
});

test("splits antimeridian rectangles into conventional GeoJSON components", () => {
  const result = createRectangleSelection([170, -10], [-170, 10]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.selection.geometry.type, "MultiPolygon");
  assert.equal(result.selection.geometry.coordinates.length, 2);
  assert.deepEqual(result.selection.bbox.geoJson, [170, -10, -170, 10]);
  assert.deepEqual(componentBboxes(result.selection), [
    [170, -10, 180, 10],
    [-180, -10, -170, 10],
  ]);
  assert.ok(result.selection.area.squareMeters > 0);
  assert.ok(result.selection.area.squareMeters < 10_000_000_000_000);
});

test("omits degenerate dateline pieces and rejects ambiguous or zero-area inputs", () => {
  const atBoundary = createRectangleSelection([180, 1], [-170, 2]);
  assert.equal(atBoundary.ok, true);
  if (atBoundary.ok) assert.equal(atBoundary.selection.geometry.type, "Polygon");

  assert.equal(createRectangleSelection([0, 0], [180, 1]).ok, false);
  assert.equal(createRectangleSelection([-180, 0], [180, 1]).ok, false);
  assert.equal(createRectangleSelection([0, 1], [1, 1]).ok, false);
  assert.equal(createRectangleSelection([0, 0], [1, 0]).ok, false);
  assert.equal(createRectangleSelection([181, 0], [1, 1]).ok, false);
});

test("contains points inclusively and handles a wrapped bbox", () => {
  const wrapped = createRectangleSelection([170, -10], [-170, 10]);
  assert.equal(wrapped.ok, true);
  if (!wrapped.ok) return;

  assert.equal(containsPoint(wrapped.selection, [180, 0]), true);
  assert.equal(containsPoint(wrapped.selection, [-175, 0]), true);
  assert.equal(containsPoint(wrapped.selection, [175, 10]), true);
  assert.equal(containsPoint(wrapped.selection, [0, 0]), false);
  assert.equal(containsPoint(wrapped.selection, [175, 11]), false);
  assert.equal(containsPoint(wrapped.selection, [Number.NaN, 0]), false);
});

test("validates closure, coordinate bounds, duplicate edges, and self-crossing rings", () => {
  assert.deepEqual(validateWgs84Ring([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), { valid: true });
  assert.deepEqual(validateWgs84Ring([[0, 0], [1, 0], [1, 1], [0, 1]]), { valid: false, reason: "not-closed" });
  assert.deepEqual(validateWgs84Ring([[0, 0], [1, 0], [1, 1], [181, 1], [0, 0]]), { valid: false, reason: "invalid-coordinate" });
  assert.deepEqual(validateWgs84Ring([[0, 0], [1, 0], [1, 0], [0, 1], [0, 0]]), { valid: false, reason: "duplicate-edge" });
  assert.deepEqual(validateWgs84Ring([[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]), { valid: false, reason: "self-intersection" });
});
