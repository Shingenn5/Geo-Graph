/**
 * Bounded point sampling for area-level context. These samples are probes of
 * published map services; they do not establish uniform coverage of an area.
 */
export type AreaBbox = { west: number; south: number; east: number; north: number };
export type AreaPoint = { longitude: number; latitude: number; id: "center" | "northwest" | "northeast" | "southwest" | "southeast" };
export type AreaDomain = "soil" | "geology";
export type PointLookup<T = unknown> = {
  status: "available" | "no-record" | "unavailable";
  source: string;
  retrievedAt?: string;
  href?: string;
  data?: T;
  error?: string;
};
export type AreaPointResult = {
  point: AreaPoint;
  soil: PointLookup;
  geology: PointLookup;
};
export type AreaEvidence<T = unknown> = {
  schema: "geo-graph-area-evidence/v1";
  bbox: AreaBbox;
  sampling: { method: "center-plus-inset-corners"; insetFraction: number; sampleCount: 5; coverageClaim: "point-samples-only" };
  notice: string;
  samples: AreaPointResult[];
  aggregate: Record<AreaDomain, { sampled: number; available: number; noRecord: number; unavailable: number; observations: Array<{ pointId: AreaPoint["id"]; lookup: PointLookup<T> }> }>;
};

function validate(b: AreaBbox) {
  if (![b.west, b.south, b.east, b.north].every(Number.isFinite) || b.west < -180 || b.west > 180 || b.east < -180 || b.east > 180 || b.south < -90 || b.north > 90 || b.south >= b.north) {
    throw new RangeError("Area bbox must be valid WGS84 bounds with positive height.");
  }
}

/** Five deterministic positions, inset from edges to reduce boundary artifacts. */
export function areaSamplePoints(bbox: AreaBbox, insetFraction = 0.1): AreaPoint[] {
  validate(bbox);
  if (!Number.isFinite(insetFraction) || insetFraction < 0 || insetFraction >= 0.5) throw new RangeError("Inset fraction must be in [0, 0.5).");
  const span = bbox.east >= bbox.west ? bbox.east - bbox.west : 360 - bbox.west + bbox.east;
  if (span <= 0 || span >= 180) throw new RangeError("Area longitude span must be greater than zero and less than 180 degrees.");
  const lon = (fraction: number) => {
    const raw = bbox.west + span * fraction;
    return raw > 180 ? raw - 360 : raw;
  };
  const lat = (fraction: number) => bbox.south + (bbox.north - bbox.south) * fraction;
  return [
    { id: "center", longitude: lon(0.5), latitude: lat(0.5) },
    { id: "northwest", longitude: lon(insetFraction), latitude: lat(1 - insetFraction) },
    { id: "northeast", longitude: lon(1 - insetFraction), latitude: lat(1 - insetFraction) },
    { id: "southwest", longitude: lon(insetFraction), latitude: lat(insetFraction) },
    { id: "southeast", longitude: lon(1 - insetFraction), latitude: lat(insetFraction) },
  ];
}

function failed<T>(error: unknown): PointLookup<T> {
  return { status: "unavailable", source: "Point lookup", error: error instanceof Error ? error.message : String(error) };
}

/** Query each existing point endpoint at five positions; errors stay distinct from empty source results. */
export async function collectAreaEvidence<TSoil = unknown, TGeology = unknown>(
  bbox: AreaBbox,
  lookup: (domain: AreaDomain, point: AreaPoint) => Promise<PointLookup<TSoil | TGeology>>,
  insetFraction = 0.1,
): Promise<AreaEvidence<TSoil | TGeology>> {
  const points = areaSamplePoints(bbox, insetFraction);
  const samples = await Promise.all(points.map(async point => {
    const [soilResult, geologyResult] = await Promise.allSettled([lookup("soil", point), lookup("geology", point)]);
    return { point, soil: soilResult.status === "fulfilled" ? soilResult.value : failed<TSoil | TGeology>(soilResult.reason), geology: geologyResult.status === "fulfilled" ? geologyResult.value : failed<TSoil | TGeology>(geologyResult.reason) };
  }));
  const summarize = (domain: AreaDomain): AreaEvidence<TSoil | TGeology>["aggregate"]["soil"] => {
    const observations = samples.map(sample => ({ pointId: sample.point.id, lookup: sample[domain] }));
    return { sampled: observations.length, available: observations.filter(x => x.lookup.status === "available").length, noRecord: observations.filter(x => x.lookup.status === "no-record").length, unavailable: observations.filter(x => x.lookup.status === "unavailable").length, observations };
  };
  return {
    schema: "geo-graph-area-evidence/v1", bbox,
    sampling: { method: "center-plus-inset-corners", insetFraction, sampleCount: 5, coverageClaim: "point-samples-only" },
    notice: "Evidence is sampled at five points from published map services. It does not establish uniform coverage or conditions throughout the selected area.",
    samples, aggregate: { soil: summarize("soil"), geology: summarize("geology") },
  };
}
