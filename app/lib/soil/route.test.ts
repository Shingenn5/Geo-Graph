import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../../api/soil/route.ts";

test("soil API distinguishes upstream failure, empty coverage, and unknown observations", async () => {
  const original = globalThis.fetch;
  const headers = ["mukey", "muname", "chkey", "floodingfrequency", "pondingfrequency", "surveymatchcount"];
  try {
    for (const [body, status] of [
      [{ error: "service changed" }, 502],
      [{ Table: [["wrong columns"]] }, 502],
      [{ Table: [] }, 502],
      [{ Table: [headers, [null, null, null, null, null, "0"]] }, 200],
      [{ Table: [headers, ["1", "Mapped soil", null, null, "None", "1"]] }, 200],
    ] as const) {
      globalThis.fetch = async (_input, init) => {
        if (!init?.body) return new Response("\n", { status: 200 });
        const { query } = JSON.parse(String(init?.body));
        // Only source-reported None is allowed; absent monthly rows stay SQL NULL.
        assert.doesNotMatch(query, /COALESCE\(\(SELECT TOP 1 cm\.(flod|pond)freqcl/);
        assert.match(query, /CASE WHEN cm.flodfreqcl = 'None' THEN 1 ELSE 0 END/);
        return Response.json(body);
      };
      const response = await GET(new Request("http://localhost/api/soil?lat=40&lng=-110"));
      assert.equal(response.status, status);
      const result = await response.json() as { error?: string; soil?: null | { floodingFrequency: string | null; pondingFrequency: string | null } };
      if (status === 502) {
        assert.equal(response.headers.get("Cache-Control"), "no-store");
        assert.ok(result.error);
        assert.equal("soil" in result, false);
      } else if (result.soil) {
        assert.equal(result.soil.floodingFrequency, null);
        assert.equal(result.soil.pondingFrequency, "None");
      } else assert.equal(result.soil, null);
    }
  } finally { globalThis.fetch = original; }
});
