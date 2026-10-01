export const GLOBAL_SOIL_SOURCE = "ISRIC SoilGrids 2.0 · 250 m model predictions · CC BY 4.0";
export const SOIL_DEPTHS = ["0-5", "5-15", "15-30", "30-60", "60-100", "100-200"] as const;
const PROPERTIES = ["phh2o", "sand", "silt", "clay"] as const;
let active = 0;
const waiting: (() => void)[] = [];

async function queryLayer(property: string, longitude: number, latitude: number, depth: string, signal: AbortSignal) {
  // Area selection queries five positions. Bound requests across all selections.
  signal.throwIfAborted();
  if (active >= 4) await new Promise<void>((resolve, reject) => {
    const begin = () => { signal.removeEventListener("abort", abort); resolve(); };
    const abort = () => { const index = waiting.indexOf(begin); if (index >= 0) waiting.splice(index, 1); reject(signal.reason); };
    waiting.push(begin);
    signal.addEventListener("abort", abort, { once: true });
  });
  else active++;
  try {
    signal.throwIfAborted();
    const response = await fetch(soilGridQuery(property, longitude, latitude, depth), { signal });
    if (!response.ok) throw new Error("Global soil service unavailable");
    const text = await response.text();
    // MapServer's GeoJSON template emits only whitespace when its soil mask has no pixel.
    return text.trim() ? gridValue(JSON.parse(text), property) : null;
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

export function soilGridQuery(property: string, longitude: number, latitude: number, depth: string = "0-5") {
  const layers = `${property}_${depth}cm_mean`;
  return "https://maps.isric.org/mapserv?" + new URLSearchParams({
    map: `/map/${property}.map`, SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetFeatureInfo",
    LAYERS: layers, QUERY_LAYERS: layers, STYLES: "", SRS: "EPSG:4326",
    BBOX: [longitude - 0.001, latitude - 0.001, longitude + 0.001, latitude + 0.001].join(","),
    WIDTH: "101", HEIGHT: "101", X: "50", Y: "50", INFO_FORMAT: "application/geo+json",
  });
}

export function gridValue(data: unknown, property: string) {
  const collection = data as { type?: string; features?: { id?: string; properties?: { pixel_value?: unknown } }[] };
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) throw new Error("Invalid global soil response");
    if (collection.features.length > 1) throw new Error("Ambiguous global soil response");
    const raw = collection.features[0]?.properties?.pixel_value;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > (property === "phh2o" ? 140 : 1000)) return null;
    // pH*10 and g/kg -> pH and mass percent, respectively.
    return raw / 10;
}

export async function globalSoil(longitude: number, latitude: number) {
  // The WMS JSON template repeats IDs and concatenates invalid JSON for multi-layer
  // requests. Query one layer at a time; depth comes from the requested layer.
  const queries = [...SOIL_DEPTHS.map(depth => ({ property: "phh2o", depth })),
    ...PROPERTIES.filter(property => property !== "phh2o").map(property => ({ property, depth: "0-5" as const }))];
  const signal = AbortSignal.timeout(15000);
  const responses = await Promise.allSettled(queries.map(({ property, depth }) => queryLayer(property, longitude, latitude, depth, signal)));
  if (responses.every(result => result.status === "rejected")) throw new Error("Global soil service unavailable");
  const value = (property: string, depth: string) => {
    const i = queries.findIndex(query => query.property === property && query.depth === depth);
    return i >= 0 && responses[i].status === "fulfilled" ? responses[i].value : null;
  };
  const horizons = SOIL_DEPTHS.map(depth => {
    const [topCm, bottomCm] = depth.split("-").map(Number);
    return { key: depth, name: `${depth} cm · predicted`, topCm, bottomCm, ph: value("phh2o", depth), sandPercent: value("sand", depth), siltPercent: value("silt", depth), clayPercent: value("clay", depth), texture: null };
  });
  if (!horizons.some(horizon => [horizon.ph, horizon.sandPercent, horizon.siltPercent, horizon.clayPercent].some(value => value !== null))) {
    if (responses.some(result => result.status === "rejected")) throw new Error("Global soil lookup incomplete");
    return { soil: null, source: GLOBAL_SOIL_SOURCE };
  }
  return {
    source: GLOBAL_SOIL_SOURCE,
    soil: {
      evidenceKind: "derived", dataSource: GLOBAL_SOIL_SOURCE, resolutionMeters: 250,
      interpretation: "250 m model estimates: pH at six depth intervals to 2 m; surface sand, silt and clay at 0–5 cm. Not measured horizons, bedrock depth, borehole logs, or drilling suitability. Prediction uncertainty has not been queried.",
      mapUnitName: "Global soil predictions", mapUnitKey: null, mapUnitSymbol: "250 m grid",
      surveyAreaName: "SoilGrids 2.0", surveyAreaSymbol: null,
      ...horizons[0], horizons,
      horizonName: horizons[0].name, horizonTopCm: 0, horizonBottomCm: 5,
      partial: responses.some(result => result.status === "rejected"),
    },
  };
}
