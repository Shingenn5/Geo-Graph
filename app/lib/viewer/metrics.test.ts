import test from "node:test";
import assert from "node:assert/strict";
import { metricDataKey } from "./metrics.ts";

test("surface timing names become valid dataset keys, including Bare Earth", () => {
  assert.equal(metricDataKey("maplibre-layer-Bare Earth"), "ggMaplibreLayerBareEarth");
  assert.equal(metricDataKey("terrain-visible"), "ggTerrainVisible");
  assert.match(metricDataKey("layer / diagnostic: test"), /^[A-Za-z0-9]+$/);
});
