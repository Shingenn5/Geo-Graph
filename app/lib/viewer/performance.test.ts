import { strict as assert } from "node:assert";
import { test } from "node:test";
import { BoundedCache, coordinateQuery, cachedJson } from "./cache.ts";
import { TransitionGate, hasLayerCoverage } from "./transition.ts";

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
test("idle and unrelated or old-view tile events cannot establish target coverage",()=>{
  const evidence=new Map([["satellite","view-a"],["geology","view-old"]]);
  assert.equal(hasLayerCoverage(["geology"],"view-a",evidence,()=>true),false);
  evidence.set("geology","view-a");
  assert.equal(hasLayerCoverage(["geology"],"view-a",evidence,()=>false),false);
  assert.equal(hasLayerCoverage(["geology"],"view-a",evidence,()=>true),true);
  assert.equal(hasLayerCoverage(["geology","topo"],"view-a",evidence,()=>true),false);
});
