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
SELECT
  mu.mukey, mu.musym, mu.muname, lg.areasymbol, lg.areaname,
  (SELECT COUNT(*) FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}')) AS surveymatchcount,
  c.cokey, c.compname, c.compkind, c.majcompflag, c.comppct_r,
  c.taxorder, c.taxsubgrp, c.taxclname, c.drainagecl, c.hydgrp,
  c.slope_l, c.slope_r, c.slope_h, c.runoff, c.hydricrating, c.hydricon,
  c.corcon, c.corsteel, c.frostact, c.nirrcapcl, c.irrcapcl,
  COALESCE((SELECT TOP 1 cm.flodfreqcl FROM comonth cm WHERE cm.cokey = c.cokey AND cm.flodfreqcl IS NOT NULL AND cm.flodfreqcl <> 'None' ORDER BY cm.monthseq), 'None') AS floodingfrequency,
  COALESCE((SELECT TOP 1 cm.pondfreqcl FROM comonth cm WHERE cm.cokey = c.cokey AND cm.pondfreqcl IS NOT NULL AND cm.pondfreqcl <> 'None' ORDER BY cm.monthseq), 'None') AS pondingfrequency,
  (SELECT TOP 1 cr.reskind FROM corestrictions cr WHERE cr.cokey = c.cokey ORDER BY cr.resdept_r) AS restrictionkind,
  (SELECT TOP 1 cr.resdept_r FROM corestrictions cr WHERE cr.cokey = c.cokey ORDER BY cr.resdept_r) AS restrictiondepthcm,
  hz.chkey, hz.hzname, hz.hzdept_r, hz.hzdepb_r,
  (SELECT TOP 1 ct.texcl FROM chtexturegrp ctg JOIN chtexture ct ON ct.chtgkey = ctg.chtgkey WHERE ctg.chkey = hz.chkey AND ctg.rvindicator = 'Yes') AS texture,
  hz.sandtotal_r, hz.silttotal_r, hz.claytotal_r, hz.fragvoltot_r,
  hz.om_r, hz.ph1to1h2o_r, hz.awc_r, hz.ksat_r, hz.dbthirdbar_r,
  hz.kwfact, hz.ll_r, hz.pi_r, hz.cec7_r, hz.ec_r
FROM mapunit mu
JOIN legend lg ON mu.lkey = lg.lkey
LEFT JOIN component c ON c.cokey = (
  SELECT TOP 1 c2.cokey FROM component c2
  WHERE c2.mukey = mu.mukey ORDER BY c2.comppct_r DESC, c2.cokey
)
LEFT JOIN chorizon hz ON hz.cokey = c.cokey
WHERE mu.mukey = (
  SELECT MIN(mukey) FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}')
)
ORDER BY hz.hzdept_r, hz.hzdepb_r`;

  try {
    const response = await fetch("https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, format: "JSON+COLUMNNAME" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Upstream failed");
    const data = await response.json() as SoilDataAccessResponse;
    const [headers, ...values] = data.Table ?? [];
    if (!headers || !values.length) {
      return Response.json({ soil: null }, { headers: { "Cache-Control": "public, max-age=86400" } });
    }
    const rows = values.map(valueRow => Object.fromEntries(headers.map((header, index) => [header, valueRow[index]])));
    const row = rows[0];
    const horizons = rows.filter(item => item.chkey).map(item => ({
      key: item.chkey,
      name: item.hzname,
      topCm: numberOrNull(item.hzdept_r),
      bottomCm: numberOrNull(item.hzdepb_r),
      texture: item.texture,
      sandPercent: numberOrNull(item.sandtotal_r),
      siltPercent: numberOrNull(item.silttotal_r),
      clayPercent: numberOrNull(item.claytotal_r),
      rockFragmentsPercent: numberOrNull(item.fragvoltot_r),
      organicMatterPercent: numberOrNull(item.om_r),
      ph: numberOrNull(item.ph1to1h2o_r),
      availableWaterCapacity: numberOrNull(item.awc_r),
      saturatedHydraulicConductivity: numberOrNull(item.ksat_r),
      bulkDensity: numberOrNull(item.dbthirdbar_r),
      erosionKFactor: numberOrNull(item.kwfact),
      liquidLimit: numberOrNull(item.ll_r),
      plasticityIndex: numberOrNull(item.pi_r),
      cationExchangeCapacity: numberOrNull(item.cec7_r),
      electricalConductivity: numberOrNull(item.ec_r),
    }));
    const surface = horizons[0] ?? null;
    const profileAvailableWaterStorageMm = horizons.reduce((total, horizon) => {
      if (horizon.topCm == null || horizon.bottomCm == null || horizon.availableWaterCapacity == null) return total;
      return total + (horizon.bottomCm - horizon.topCm) * horizon.availableWaterCapacity * 10;
    }, 0);
    return Response.json({
      soil: {
        mapUnitKey: row.mukey, mapUnitSymbol: row.musym, mapUnitName: row.muname,
        surveyAreaSymbol: row.areasymbol, surveyAreaName: row.areaname,
        surveyMatchCount: numberOrNull(row.surveymatchcount),
        componentName: row.compname, componentKind: row.compkind,
        majorComponent: row.majcompflag === "Yes", componentPercent: numberOrNull(row.comppct_r),
        taxonomicOrder: row.taxorder, taxonomicSubgroup: row.taxsubgrp, taxonomicClass: row.taxclname,
        drainageClass: row.drainagecl, hydrologicGroup: row.hydgrp,
        slopeLowPercent: numberOrNull(row.slope_l), slopePercent: numberOrNull(row.slope_r), slopeHighPercent: numberOrNull(row.slope_h),
        runoffClass: row.runoff, hydricRating: row.hydricrating, hydricCondition: row.hydricon,
        floodingFrequency: row.floodingfrequency, pondingFrequency: row.pondingfrequency,
        concreteCorrosion: row.corcon, steelCorrosion: row.corsteel, frostAction: row.frostact,
        nonIrrigatedCapabilityClass: row.nirrcapcl, irrigatedCapabilityClass: row.irrcapcl,
        restrictionKind: row.restrictionkind, restrictionDepthCm: numberOrNull(row.restrictiondepthcm),
        profileAvailableWaterStorageMm: Math.round(profileAvailableWaterStorageMm * 10) / 10,
        horizonName: surface?.name ?? null, horizonTopCm: surface?.topCm ?? null, horizonBottomCm: surface?.bottomCm ?? null,
        texture: surface?.texture ?? null, sandPercent: surface?.sandPercent ?? null, siltPercent: surface?.siltPercent ?? null,
        clayPercent: surface?.clayPercent ?? null, organicMatterPercent: surface?.organicMatterPercent ?? null,
        ph: surface?.ph ?? null, availableWaterCapacity: surface?.availableWaterCapacity ?? null,
        permeability: surface?.saturatedHydraulicConductivity != null ? `${surface.saturatedHydraulicConductivity} µm/s Ksat` : null,
        horizons,
      },
      source: "USDA NRCS Soil Data Access / SSURGO",
    }, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch {
    return Response.json({ error: "USDA soil survey service unavailable" }, { status: 502 });
  }
}
