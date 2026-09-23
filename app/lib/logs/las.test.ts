import assert from "node:assert/strict";
import test from "node:test";
import { parseLas } from "./las.ts";

const sample = (data = "1000 42\n1001 -999.25\n1002 44") => `~Version Information
 VERS. 2.0 : version
~Well Information
 NULL. -999.25 : null value
~Curve Information
 DEPT.M : Measured depth
 GR.API : Gamma ray
~ASCII
${data}`;

test("parses LAS 2.0 curves, depth units, NULLs, and leaves depth reference unknown", () => {
  const result = parseLas(sample());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.log.depthUnit, "M");
  assert.equal(result.log.depthReference, "unknown");
  assert.equal(result.log.verticalDatum, null);
  assert.equal(result.log.rows[1]?.values[1], null);
  assert.deepEqual(result.log.depthIssues, []);
});

test("reports duplicate and direction changes while preserving rows", () => {
  const result = parseLas(sample("10 1\n10 2\n11 3\n9 4"));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.log.depthIssues, [
    { row: 2, kind: "duplicate" }, { row: 4, kind: "nonmonotonic" },
  ]);
});

test("requires explicit, unit-bearing, unambiguous depth metadata", () => {
  const noDepth = parseLas(sample().replace("DEPT.M", "TIME.S"));
  assert.equal(noDepth.ok, false);
  if (!noDepth.ok) assert.match(noDepth.error, /DEPT or DEPTH/);
  const noUnit = parseLas(sample().replace("DEPT.M", "DEPTH."));
  assert.equal(noUnit.ok, false);
  if (!noUnit.ok) assert.match(noUnit.error, /declare its unit/);
  const ambiguous = parseLas(sample().replace("DEPT.M", "DEPT.M\n DEPTH.FT"));
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.match(ambiguous.error, /single explicit/);
});

test("rejects malformed rows and bounded-input violations", () => {
  const malformed = parseLas(sample("1000 nope"));
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.error, /nonnumeric/);
  const oversized = parseLas("x".repeat(5_000_001));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.match(oversized.error, /5 MB/);
  const wrongWidth = parseLas(sample("1000"));
  assert.equal(wrongWidth.ok, false);
  if (!wrongWidth.ok) assert.match(wrongWidth.error, /expected 2/);
});
