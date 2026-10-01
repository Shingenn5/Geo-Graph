import assert from "node:assert/strict";
import test from "node:test";
import { parseLas } from "./las.ts";
import { buildLogTrack } from "./plot.ts";

function log(data: string) {
  const parsed = parseLas(`~Version\nVERS. 2.0\n~Well\nNULL. -999.25\n~Curve\nDEPT.M : Depth\nGR.API : Gamma ray\n~ASCII\n${data}`);
  assert.ok(parsed.ok);
  return parsed.log;
}

test("decimation keeps narrow extrema and stays bounded for a large log", () => {
  const source = log(Array.from({ length: 20000 }, (_, i) => `${1000 + i} ${i === 831 ? 999 : i === 833 ? -5 : 20}`).join("\n"));
  const track = buildLogTrack(source, 1, 50)!;
  assert.equal(track.minValue, -5);
  assert.equal(track.maxValue, 999);
  assert.ok(track.path.includes("152.00,"));
  assert.ok(track.path.includes("8.00,"));
  assert.ok(track.plottedRows <= 200);
});

test("NULLs skipped inside a decimation bucket still break the curve", () => {
  const track = buildLogTrack(log("10 1\n11 -999.25\n12 3\n13 4"), 1, 1)!;
  assert.equal((track.path.match(/M/g) || []).length, 2);
  assert.equal(track.validRows, 3);
});

test("descending depths plot shallow at top and duplicate or reversed depths split paths", () => {
  const track = buildLogTrack(log("12 3\n11 2\n11 4\n13 5"), 1)!;
  assert.equal(track.minDepth, 11);
  assert.equal(track.maxDepth, 13);
  assert.equal((track.path.match(/M/g) || []).length, 3);
  assert.ok(!track.path.includes("NaN"));
});

test("empty measurements yield no track and constant curves remain finite", () => {
  assert.equal(buildLogTrack(log("10 -999.25\n11 -999.25"), 1), null);
  assert.ok(buildLogTrack(log("10 4\n11 4"), 1)!.path.includes("80.00"));
});
