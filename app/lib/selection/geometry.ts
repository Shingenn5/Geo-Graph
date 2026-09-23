/**
 * Ground-selection geometry helpers. All input/output coordinates use WGS84
 * longitude, latitude in decimal degrees (GeoJSON's OGC:CRS84 order).
 *
 * Rectangle edges follow parallels and meridians. The reported area integrates
 * the WGS84 ellipsoid surface between those edges; it is not an estimate based
 * on map pixels or a planar degree-to-distance conversion.
 */

export type Wgs84Point = readonly [longitude: number, latitude: number];
export type MutablePosition = [longitude: number, latitude: number];
export type PolygonGeometry = {
  type: "Polygon";
  coordinates: MutablePosition[][];
};
export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: MutablePosition[][][];
};
export type RectangleGeometry = PolygonGeometry | MultiPolygonGeometry;

export type SelectionBbox = {
  west: number;
  south: number;
  east: number;
  north: number;
  crossesAntimeridian: boolean;
  /** GeoJSON order. For a dateline-spanning box, west is greater than east. */
  geoJson: [west: number, south: number, east: number, north: number];
};

export type RectangleSelection = {
  geometry: RectangleGeometry;
  bbox: SelectionBbox;
  area: {
    squareMeters: number;
    hectares: number;
    acres: number;
    method: "WGS84 ellipsoid surface integral over latitude/longitude bounds";
  };
};

export type RectangleSelectionError =
  | "invalid-coordinate"
  | "zero-width"
  | "zero-height"
  | "ambiguous-half-world-width"
  | "invalid-geometry";

export type RectangleSelectionResult =
  | { ok: true; selection: RectangleSelection }
  | { ok: false; error: RectangleSelectionError; message: string };

const LONGITUDE_LIMIT = 180;
const LATITUDE_LIMIT = 90;
const WGS84_SEMI_MAJOR_METERS = 6_378_137;
const WGS84_INVERSE_FLATTENING = 298.257223563;
const WGS84_FLATTENING = 1 / WGS84_INVERSE_FLATTENING;
const WGS84_ECCENTRICITY_SQUARED =
  WGS84_FLATTENING * (2 - WGS84_FLATTENING);
const WGS84_ECCENTRICITY = Math.sqrt(WGS84_ECCENTRICITY_SQUARED);
const SQUARE_METERS_PER_HECTARE = 10_000;
const SQUARE_METERS_PER_ACRE = 4_046.8564224;
const DEGREES_TO_RADIANS = Math.PI / 180;

function validPoint(point: unknown): point is Wgs84Point {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    typeof point[0] === "number" &&
    Number.isFinite(point[0]) &&
    Math.abs(point[0]) <= LONGITUDE_LIMIT &&
    typeof point[1] === "number" &&
    Number.isFinite(point[1]) &&
    Math.abs(point[1]) <= LATITUDE_LIMIT
  );
}

function failure(
  error: RectangleSelectionError,
  message: string,
): RectangleSelectionResult {
  return { ok: false, error, message };
}

function closeRing(west: number, south: number, east: number, north: number): MutablePosition[] {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/**
 * Build the smallest longitude-span rectangle described by two opposite
 * corners. A date-line crossing is split into valid GeoJSON components, so no
 * polygon edge accidentally traverses the rest of the world.
 */
export function createRectangleSelection(
  first: Wgs84Point,
  second: Wgs84Point,
): RectangleSelectionResult {
  if (!validPoint(first) || !validPoint(second)) {
    return failure(
      "invalid-coordinate",
      "Each corner must be a finite WGS84 longitude/latitude within [-180, 180] and [-90, 90].",
    );
  }

  const [firstLongitude, firstLatitude] = first;
  const [secondLongitude, secondLatitude] = second;
  const rawLongitudeSpan = Math.abs(firstLongitude - secondLongitude);
  const latitudeSpan = Math.abs(firstLatitude - secondLatitude);

  if (rawLongitudeSpan === 0 || rawLongitudeSpan === 360) {
    return failure("zero-width", "The corners lie on the same meridian; a rectangle needs nonzero width.");
  }
  if (latitudeSpan === 0) {
    return failure("zero-height", "The corners lie on the same parallel; a rectangle needs nonzero height.");
  }
  if (rawLongitudeSpan === 180) {
    return failure(
      "ambiguous-half-world-width",
      "Corners exactly 180 degrees apart have two equally short longitude spans.",
    );
  }

  const south = Math.min(firstLatitude, secondLatitude);
  const north = Math.max(firstLatitude, secondLatitude);
  const crossesAntimeridian = rawLongitudeSpan > 180;
  const west = crossesAntimeridian
    ? Math.max(firstLongitude, secondLongitude)
    : Math.min(firstLongitude, secondLongitude);
  const east = crossesAntimeridian
    ? Math.min(firstLongitude, secondLongitude)
    : Math.max(firstLongitude, secondLongitude);

  let geometry: RectangleGeometry;
  if (!crossesAntimeridian) {
    geometry = {
      type: "Polygon",
      coordinates: [closeRing(west, south, east, north)],
    };
  } else {
    // A component with zero width at +/-180 is unnecessary and invalid. The
    // remaining component still describes the same closed region on the globe.
    const rings: MutablePosition[][] = [];
    if (west < LONGITUDE_LIMIT) {
      rings.push(closeRing(west, south, LONGITUDE_LIMIT, north));
    }
    if (east > -LONGITUDE_LIMIT) {
      rings.push(closeRing(-LONGITUDE_LIMIT, south, east, north));
    }
    if (rings.length === 1) {
      geometry = { type: "Polygon", coordinates: rings };
    } else if (rings.length === 2) {
      geometry = { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) };
    } else {
      return failure("invalid-geometry", "The corners do not enclose a representable rectangle.");
    }
  }

  const spanRadians = (crossesAntimeridian ? 360 - rawLongitudeSpan : rawLongitudeSpan) * DEGREES_TO_RADIANS;
  const areaSquareMeters = ellipsoidRectangleArea(south, north, spanRadians);
  if (!Number.isFinite(areaSquareMeters) || areaSquareMeters <= 0) {
    return failure("invalid-geometry", "The rectangle has no finite positive WGS84 surface area.");
  }

  const bbox: SelectionBbox = {
    west,
    south,
    east,
    north,
    crossesAntimeridian,
    geoJson: [west, south, east, north],
  };
  return {
    ok: true,
    selection: {
      geometry,
      bbox,
      area: {
        squareMeters: areaSquareMeters,
        hectares: areaSquareMeters / SQUARE_METERS_PER_HECTARE,
        acres: areaSquareMeters / SQUARE_METERS_PER_ACRE,
        method: "WGS84 ellipsoid surface integral over latitude/longitude bounds",
      },
    },
  };
}

/** Exact ellipsoid surface area for a rectangle bounded by meridians/parallels. */
function ellipsoidRectangleArea(south: number, north: number, longitudeSpanRadians: number): number {
  const a = WGS84_SEMI_MAJOR_METERS;
  const e = WGS84_ECCENTRICITY;
  const eSquared = WGS84_ECCENTRICITY_SQUARED;
  const primitive = (latitudeDegrees: number): number => {
    const u = Math.sin(latitudeDegrees * DEGREES_TO_RADIANS);
    const denominator = 1 - eSquared * u * u;
    const integral = u / (2 * denominator) + Math.atanh(e * u) / (2 * e);
    return a * a * (1 - eSquared) * integral;
  };
  return longitudeSpanRadians * (primitive(north) - primitive(south));
}

export type RingValidation =
  | { valid: true }
  | { valid: false; reason: "too-few-vertices" | "invalid-coordinate" | "not-closed" | "duplicate-edge" | "self-intersection" };

/** Validate one linear ring's WGS84 coordinates, closure, edges, and simplicity. */
export function validateWgs84Ring(vertices: readonly unknown[]): RingValidation {
  if (!Array.isArray(vertices) || vertices.length < 4) {
    return { valid: false, reason: "too-few-vertices" };
  }
  if (!vertices.every(validPoint)) return { valid: false, reason: "invalid-coordinate" };
  const points = vertices as readonly Wgs84Point[];
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return { valid: false, reason: "not-closed" };

  const open = points.slice(0, -1);
  if (open.length < 3) return { valid: false, reason: "too-few-vertices" };
  const unwrapped = unwrapLongitudes(open);
  for (let i = 0; i < unwrapped.length; i += 1) {
    const next = unwrapped[(i + 1) % unwrapped.length];
    if (samePoint(unwrapped[i], next)) return { valid: false, reason: "duplicate-edge" };
  }
  for (let i = 0; i < unwrapped.length; i += 1) {
    const a = unwrapped[i];
    const b = unwrapped[(i + 1) % unwrapped.length];
    for (let j = i + 1; j < unwrapped.length; j += 1) {
      // Adjacent segments share an endpoint by design, as do first/last.
      if (j === i + 1 || (i === 0 && j === unwrapped.length - 1)) continue;
      const c = unwrapped[j];
      const d = unwrapped[(j + 1) % unwrapped.length];
      if (segmentsIntersect(a, b, c, d)) return { valid: false, reason: "self-intersection" };
    }
  }
  return { valid: true };
}

function samePoint(a: Wgs84Point, b: Wgs84Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function unwrapLongitudes(points: readonly Wgs84Point[]): MutablePosition[] {
  const result: MutablePosition[] = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i += 1) {
    const previousLongitude = result[i - 1][0];
    let longitude = points[i][0];
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    result.push([longitude, points[i][1]]);
  }
  return result;
}

function orientation(a: Wgs84Point, b: Wgs84Point, c: Wgs84Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Wgs84Point, b: Wgs84Point, p: Wgs84Point): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) &&
    p[0] <= Math.max(a[0], b[0]) &&
    p[1] >= Math.min(a[1], b[1]) &&
    p[1] <= Math.max(a[1], b[1])
  );
}

function segmentsIntersect(a: Wgs84Point, b: Wgs84Point, c: Wgs84Point, d: Wgs84Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) {
    return true;
  }
  return (
    (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b))
  );
}

/** Boundary-inclusive point test for selections produced by createRectangleSelection. */
export function containsPoint(selection: Pick<RectangleSelection, "bbox">, point: Wgs84Point): boolean {
  if (!validPoint(point)) return false;
  const { west, south, east, north, crossesAntimeridian } = selection.bbox;
  if (point[1] < south || point[1] > north) return false;
  return crossesAntimeridian
    ? point[0] >= west || point[0] <= east
    : point[0] >= west && point[0] <= east;
}

/** Return a conventional non-wrapping GeoJSON bbox for indexing split geometry. */
export function componentBboxes(selection: Pick<RectangleSelection, "bbox">): Array<[number, number, number, number]> {
  const { west, south, east, north, crossesAntimeridian } = selection.bbox;
  return crossesAntimeridian
    ? [[west, south, LONGITUDE_LIMIT, north], [-LONGITUDE_LIMIT, south, east, north]]
    : [[west, south, east, north]];
}
