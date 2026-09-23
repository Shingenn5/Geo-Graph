import { UTAH_WELL_SOURCE } from "@/app/lib/wells/source";

const DEFAULT_RADIUS_KM = 5;
const MAX_RADIUS_KM = 25;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;
const MAX_QUERY_RECORDS = 2000;

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: { x?: unknown; y?: unknown };
};

type ArcGisResponse = {
  error?: { message?: string };
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
};

function parseBoundedNumber(value: string | null, fallback: number, min: number, max: number) {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceKm(latA: number, lngA: number, latB: number, lngB: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(latB - latA);
  const deltaLng = radians(lngB - lngA);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (!params.has("lat") || !params.has("lng") || !params.get("lat")?.trim() || !params.get("lng")?.trim()) {
    return Response.json({ error: "Provide valid lat and lng coordinates." }, { status: 400 });
  }
  const lat = parseBoundedNumber(params.get("lat"), 0, -90, 90);
  const lng = parseBoundedNumber(params.get("lng"), 0, -180, 180);
  const radiusKm = parseBoundedNumber(params.get("radiusKm"), DEFAULT_RADIUS_KM, 0.1, MAX_RADIUS_KM);
  const limit = parseBoundedNumber(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  if (lat == null || lng == null || radiusKm == null || limit == null) {
    return Response.json({ error: "Provide valid coordinates, radiusKm (0.1–25), and limit (1–50)." }, { status: 400 });
  }

  const query = new URLSearchParams({
    f: "json",
    where: "Confidential IS NULL OR Confidential IN ('No', 'N', '')",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(Math.round(radiusKm * 1000)),
    units: "esriSRUnit_Meter",
    outFields: "OBJECTID,API,WellName,Operator,WellType,WellStatus,FieldName,County,Confidential",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: String(MAX_QUERY_RECORDS),
    orderByFields: "OBJECTID ASC",
  });

  try {
    const response = await fetch(`${UTAH_WELL_SOURCE.serviceUrl}/query?${query}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Upstream request failed");
    const data = await response.json() as ArcGisResponse;
    if (data.error || !Array.isArray(data.features)) throw new Error("Invalid upstream response");

    const candidates = data.features.flatMap(feature => {
      const attributes = feature.attributes ?? {};
      const confidential = text(attributes.Confidential)?.toLowerCase();
      // The source includes a confidentiality flag. Unknown/affirmative values are omitted.
      if (confidential && !["no", "n", "false", "0"].includes(confidential)) return [];
      const longitude = numeric(feature.geometry?.x);
      const latitude = numeric(feature.geometry?.y);
      if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
      const distance = distanceKm(lat, lng, latitude, longitude);
      if (distance > radiusKm) return [];
      const api = text(attributes.API);
      const objectId = text(attributes.OBJECTID);
      return [{
        id: api ?? objectId ?? `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
        name: text(attributes.WellName) ?? "Unnamed well",
        api,
        operator: text(attributes.Operator),
        type: text(attributes.WellType),
        status: text(attributes.WellStatus),
        field: text(attributes.FieldName),
        county: text(attributes.County),
        latitude,
        longitude,
        distanceKm: Math.round(distance * 100) / 100,
      }];
    }).sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));

    const truncated = Boolean(data.exceededTransferLimit) || candidates.length > limit;
    const wells = candidates.slice(0, limit);
    return Response.json({
      wells,
      source: UTAH_WELL_SOURCE,
      coverage: {
        status: wells.length ? "ok" : "no_data",
        center: { lat, lng },
        radiusKm,
        count: wells.length,
        truncated,
        sourceLimitReached: Boolean(data.exceededTransferLimit),
        maxResults: limit,
      },
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch {
    return Response.json({ error: "Utah well data service unavailable" }, { status: 502 });
  }
}
