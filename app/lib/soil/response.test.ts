import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSoilTable } from "./response.ts";

const columns = ["mukey", "muname", "chkey", "floodingfrequency", "pondingfrequency", "surveymatchcount"];

test("empty soil coverage requires an explicit valid table", () => {
  assert.deepEqual(parseSoilTable({ Table: [columns, [null, null, null, null, null, "0"]] }), []);
  for (const invalid of [null, {}, { error: "upstream" }, { Table: null }, { Table: [["oops"]] },
    { Table: [] }, { Table: [columns] }, { Table: [columns, ["1"]] },
    { Table: [columns, [null, "Soil", null, null, null, "1"]] }]) {
    assert.throws(() => parseSoilTable(invalid));
  }
});

test("unknown frequency and explicit absence remain distinct", () => {
  const rows = parseSoilTable({ Table: [columns,
    ["1", "Soil", null, null, null, "1"],
    ["2", "Soil", null, "None", "Rare", "1"],
  ] });
  assert.equal(rows[0].floodingfrequency, null);
  assert.equal(rows[0].pondingfrequency, null);
  assert.equal(rows[1].floodingfrequency, "None");
  assert.equal(rows[1].pondingfrequency, "Rare");
});
