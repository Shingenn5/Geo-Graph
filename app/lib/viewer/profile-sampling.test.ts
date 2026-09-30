import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "cesium";
import { sampleProfileTerrain } from "./profile-sampling.ts";

test("timeout cancels owned requests and a new profile can succeed", async () => {
  const requests: C.Request[] = [];
  let finishOld: (data: C.TerrainData) => void = () => {};
  const provider = {
    tilingScheme: new C.GeographicTilingScheme(),
    requestTileGeometry(_x: number, _y: number, _level: number, request: C.Request) {
      requests.push(request);
      if (requests.length === 1) return new Promise<C.TerrainData>(resolve => { finishOld = resolve; });
      return Promise.resolve({ interpolateHeight: () => 125 } as unknown as C.TerrainData);
    },
  } as unknown as C.TerrainProvider;
  const first = [C.Cartographic.fromDegrees(-110, 40)];
  await assert.rejects(sampleProfileTerrain(provider, 8, first, new AbortController().signal, 10), /timed out/);
  assert.equal((requests[0] as C.Request & { cancelled: boolean }).cancelled, true);
  const second = await sampleProfileTerrain(provider, 8, [C.Cartographic.fromDegrees(-110, 40)], new AbortController().signal);
  assert.equal(second[0].height, 125);
  finishOld({ interpolateHeight: () => 999 } as unknown as C.TerrainData);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(second[0].height, 125, "late work must not overwrite a newer profile");
});

test("cancel stops a hung sample and does not affect a separate globe request", async () => {
  const globeRequest = new C.Request();
  let owned: C.Request | undefined;
  const provider = {
    tilingScheme: new C.GeographicTilingScheme(),
    requestTileGeometry(_x: number, _y: number, _level: number, request: C.Request) {
      owned = request;
      return new Promise<C.TerrainData>(() => {});
    },
  } as unknown as C.TerrainProvider;
  const controller = new AbortController();
  const job = sampleProfileTerrain(provider, 8, [C.Cartographic.fromDegrees(-110, 40)], controller.signal);
  controller.abort();
  await assert.rejects(job, { name: "AbortError" });
  assert.equal((owned as C.Request & { cancelled: boolean }).cancelled, true);
  assert.equal((globeRequest as C.Request & { cancelled: boolean }).cancelled, false);
});
