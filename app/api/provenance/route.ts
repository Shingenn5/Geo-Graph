const NAIP_IMAGE_SERVER = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer";
const EPQS_ENDPOINT = "https://epqs.nationalmap.gov/v1/json";
const Mapterhorn_TERRAIN = "https://tiles.mapterhorn.com/tilejson.json";

type LookupStatus = "ok" | "partial" | "unknown" | "error";
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function nonEmpty(value: unknown): unknown | null {
  return value === undefined || value === null || value === "" ? null : value;
}

function sceneDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

function completenessStatus(values: unknown[]): LookupStatus {
  const known = values.filter(value => value !== null && value !== undefined && value !== "").length;
  if (known === values.length) return "ok";
  return known ? "partial" : "unknown";
}

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
  return response.json();
}

async function lookupImagery(lat: number, lng: number) {
  const url = new URL(`${NAIP_IMAGE_SERVER}/identify`);
  url.search = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    returnGeometry: "false",
    returnCatalogItems: "true",
  }).toString();

  try {
    const response = record(await fetchJson(url));
    if (!response || response.error) throw new Error("Invalid ImageServer identify response");

    const catalog = record(response.catalogItems);
    const features = Array.isArray(catalog?.features) ? catalog.features : [];
    const attributes = record(record(features[0])?.attributes);
    if (!attributes) {
      return {
        status: "unknown" as const,
        service: NAIP_IMAGE_SERVER,
        reason: "The service returned no catalog scene for this point.",
        scene: null,
      };
    }

    const scene = {
      rasterName: nonEmpty(attributes.raster_name),
      acquisitionDate: sceneDate(attributes.acquisition_date),
      year: nonEmpty(attributes.Year),
      resolution: nonEmpty(attributes.resolution_value),
      resolutionUnits: nonEmpty(attributes.resolution_units),
      horizontalDatum: nonEmpty(attributes.datum),
      agency: nonEmpty(attributes.agency),
      vendor: nonEmpty(attributes.vendor),
      sensorType: nonEmpty(attributes.sensor_type),
      downloadUrl: nonEmpty(attributes.download_url),
    };
    const fields = [scene.rasterName, scene.acquisitionDate, scene.resolution, scene.resolutionUnits];
    return {
      status: completenessStatus(fields),
      service: NAIP_IMAGE_SERVER,
      scene,
      note: "Metadata describes the returned catalog scene. ImageServer pixel spacing is not source-scene resolution.",
    };
  } catch {
    return { status: "error" as const, service: NAIP_IMAGE_SERVER, reason: "NAIP point lookup failed.", scene: null };
  }
}

async function lookupElevation(lat: number, lng: number) {
  const url = new URL(EPQS_ENDPOINT);
  url.search = new URLSearchParams({ x: String(lng), y: String(lat), units: "Meters", output: "json" }).toString();

  try {
    const response = record(await fetchJson(url));
    if (!response || response.error) throw new Error("Invalid EPQS response");
    // The current v1 API returns { value, resolution, location }; older
    // integrations returned an Elevation_Query envelope. Preserve both shapes.
    const legacy = record(record(response.USGS_Elevation_Point_Query_Service)?.Elevation_Query);
    const query = legacy ?? response;
    const rawElevation = legacy ? query.Elevation : query.value;
    const elevation = Number(rawElevation);
    const location = record(query.location);
    const result = {
      elevation: rawElevation == null || !Number.isFinite(elevation) ? null : elevation,
      elevationUnits: legacy ? nonEmpty(query.Units) : "Meters",
      unitsBasis: legacy ? "response" : "request parameter",
      dataSource: legacy ? nonEmpty(query.Data_Source) : null,
      sourceUnits: legacy ? nonEmpty(query.Data_Source_Units) : null,
      resolution: nonEmpty(legacy ? query.Resolution : query.resolution),
      resolutionUnits: null,
      rasterId: nonEmpty(legacy ? null : query.rasterId),
      verticalDatum: legacy ? nonEmpty(query.Vertical_Datum) : null,
      returnedLocation: {
        x: nonEmpty(legacy ? query.x : location?.x),
        y: nonEmpty(legacy ? query.y : location?.y),
      },
    };
    const status = completenessStatus([result.elevation, result.elevationUnits, result.dataSource, result.resolution, result.verticalDatum]);
    return {
      status,
      service: EPQS_ENDPOINT,
      result,
      note: result.verticalDatum
        ? "Vertical datum is the value returned by EPQS."
        : "EPQS interpolates a 3DEP elevation; this response did not provide the underlying source, resolution units, or vertical datum.",
    };
  } catch {
    return { status: "error" as const, service: EPQS_ENDPOINT, reason: "USGS EPQS point lookup failed.", result: null };
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return Response.json({ error: "Provide valid lat and lng coordinates." }, { status: 400 });
  }

  // The enhanced viewer only needs an elevation reference. Do not make that
  // result wait on the independent (and often slower) imagery catalog.
  if (params.get("scope") === "elevation") {
    const elevation = await lookupElevation(lat, lng);
    return Response.json({ elevation, generatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": elevation.status === "error" ? "no-store" : "public, max-age=300" },
    });
  }
  const [imagery, elevation] = await Promise.all([lookupImagery(lat, lng), lookupElevation(lat, lng)]);
  const anyError = imagery.status === "error" || elevation.status === "error";
  const anyUsable = imagery.status === "ok" || imagery.status === "partial" || elevation.status === "ok" || elevation.status === "partial";
  const status: LookupStatus = anyError ? (anyUsable ? "partial" : "error") : anyUsable ? "partial" : "unknown";

  return Response.json({
    status,
    coordinates: { lat, lng, crs: "EPSG:4326" },
    imagery,
    elevation,
    terrainTiles: {
      status: "unknown",
      service: Mapterhorn_TERRAIN,
      source: "Mapterhorn compiled terrain tiles",
      activeUpstreamSource: null,
      sourceResolution: null,
      verticalDatum: null,
      reason: "The tile service exposes rendered terrain tiles and contributor attribution, not point-level active-source, posting, or vertical-datum metadata.",
    },
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
