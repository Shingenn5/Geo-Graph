type SoilDataAccessResponse = { Table?: Array<Array<string | null>> };

function numberOrNull(value: string | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!url.searchParams.has("lat") || !url.searchParams.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return Response.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const point = `POINT(${lng.toFixed(6)} ${lat.toFixed(6)})`;
  const query = `
SELECT TOP 1
  mu.mukey, mu.musym, mu.muname, lg.areasymbol, lg.areaname,
  c.cokey, c.compname, c.comppct_r, c.taxorder, c.taxsubgrp,
  c.drainagecl, c.hydgrp, c.slope_r,
  hz.hzname, hz.hzdept_r, hz.hzdepb_r,
  (SELECT TOP 1 ct.texcl
   FROM chtexturegrp ctg
   JOIN chtexture ct ON ct.chtgkey = ctg.chtgkey
   WHERE ctg.chkey = hz.chkey AND ctg.rvindicator = 'Yes') AS texture,
  hz.sandtotal_r, hz.silttotal_r, hz.claytotal_r, hz.om_r, hz.ph1to1h2o_r
FROM mapunit mu
JOIN legend lg ON mu.lkey = lg.lkey
LEFT JOIN component c ON c.cokey = (
  SELECT TOP 1 c2.cokey FROM component c2
  WHERE c2.mukey = mu.mukey ORDER BY c2.comppct_r DESC
)
LEFT JOIN chorizon hz ON hz.chkey = (
  SELECT TOP 1 h2.chkey FROM chorizon h2
  WHERE h2.cokey = c.cokey ORDER BY h2.hzdept_r ASC
)
WHERE mu.mukey IN (
  SELECT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}')
)`;

  try {
    const response = await fetch("https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Upstream failed");
    const data = await response.json() as SoilDataAccessResponse;
    const [headers, values] = data.Table ?? [];
    if (!headers || !values) {
      return Response.json({ soil: null }, { headers: { "Cache-Control": "public, max-age=86400" } });
    }
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    return Response.json({
      soil: {
        mapUnitKey: row.mukey,
        mapUnitSymbol: row.musym,
        mapUnitName: row.muname,
        surveyAreaSymbol: row.areasymbol,
        surveyAreaName: row.areaname,
        componentName: row.compname,
        componentPercent: numberOrNull(row.comppct_r),
        taxonomicOrder: row.taxorder,
        taxonomicSubgroup: row.taxsubgrp,
        drainageClass: row.drainagecl,
        hydrologicGroup: row.hydgrp,
        slopePercent: numberOrNull(row.slope_r),
        horizonName: row.hzname,
        horizonTopCm: numberOrNull(row.hzdept_r),
        horizonBottomCm: numberOrNull(row.hzdepb_r),
        texture: row.texture,
        sandPercent: numberOrNull(row.sandtotal_r),
        siltPercent: numberOrNull(row.silttotal_r),
        clayPercent: numberOrNull(row.claytotal_r),
        organicMatterPercent: numberOrNull(row.om_r),
        ph: numberOrNull(row.ph1to1h2o_r),
      },
      source: "USDA NRCS Soil Data Access / SSURGO",
    }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "USDA soil survey service unavailable" }, { status: 502 });
  }
}
