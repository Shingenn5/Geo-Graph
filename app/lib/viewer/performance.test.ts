import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BoundedCache, coordinateQuery, cachedJson } from "./cache.ts";
import { TransitionGate, hasLayerCoverage, TileCoverage } from "./transition.ts";

test("cache evicts least recently used entries and expires old data", () => {
  const cache = new BoundedCache<number>(2);
  cache.set("a", 1); cache.set("b", 2); assert.equal(cache.get("a"), 1);
  cache.set("c", 3); assert.equal(cache.get("b"), undefined); assert.equal(cache.size, 2);
  const expired = new BoundedCache<number>(1, -1); expired.set("a", 1);
  assert.equal(expired.get("a"), undefined);
});
test("stale transitions cannot replace the latest layer", () => {
  const gate = new TransitionGate(); const geology = gate.begin(); const soil = gate.begin();
  assert.equal(gate.current(geology), false); assert.equal(gate.current(soil), true);
  gate.cancel(); assert.equal(gate.current(soil), false);
});
test("coordinate keys preserve six decimal places", () => {
  assert.equal(coordinateQuery(-116.60000000001, 39.2), "lng=-116.600000&lat=39.200000");
});
test("aborted requests never return even cached results", async () => {
  const cache = new BoundedCache<unknown>(); cache.set("/test", { ok: true });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(cachedJson(cache, "/test", controller.signal), { name: "AbortError" });
});
test("cached geographic coverage survives camera changes but rejects unrelated or coarse tiles",()=>{
  const evidence=new TileCoverage();
  const center={lng:-109.99532,lat:40.31459};
  const tile=(z:number)=>({z,x:Math.floor((center.lng+180)/360*2**z),y:Math.floor((1-Math.asinh(Math.tan(center.lat*Math.PI/180))/Math.PI)/2*2**z)});
  evidence.record("satellite",tile(16));
  assert.equal(hasLayerCoverage(["geology"],center,16.2,evidence,()=>true),false);
  evidence.record("geology",tile(14));
  assert.equal(hasLayerCoverage(["geology"],center,16.2,evidence,()=>false),false);
  assert.equal(hasLayerCoverage(["geology","satellite"],center,16.2,evidence,()=>true),true);
  assert.equal(hasLayerCoverage(["geology"],{lng:0,lat:0},16.2,evidence,()=>true),false);
  assert.equal(hasLayerCoverage(["geology","topo"],center,16.2,evidence,()=>true),false);
  assert.equal(hasLayerCoverage(["satellite"],center,18,evidence,()=>true),false);
});
