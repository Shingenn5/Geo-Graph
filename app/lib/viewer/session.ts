export const VIEWER_SESSION_KEY = "geo-graph-viewer-v1";
export const SHARED_SURFACES = ["Natural", "Clear imagery", "Bare Earth", "Geology", "Soil"] as const;
export type SharedSurface = typeof SHARED_SURFACES[number];
export type ViewerSession = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  surface: SharedSurface;
  labels: boolean;
  point: [number, number] | null;
};
export const DEFAULT_VIEW: ViewerSession = {
  center: [-112.112, 36.106], zoom: 10.5, bearing: -28, pitch: 55,
  surface: "Natural", labels: true, point: null,
};

function coordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 85;
}

export function parseViewerSession(raw: string | null): ViewerSession | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !coordinate(value.center) ||
        !Number.isFinite(value.zoom) || value.zoom < 0 || value.zoom > 18 ||
        !Number.isFinite(value.bearing) || Math.abs(value.bearing) > 360 ||
        !Number.isFinite(value.pitch) || value.pitch < 0 || value.pitch > 75 ||
        !SHARED_SURFACES.includes(value.surface) || typeof value.labels !== "boolean" ||
        (value.point !== null && !coordinate(value.point))) return null;
    return { center: value.center, zoom: value.zoom, bearing: value.bearing, pitch: value.pitch,
      surface: value.surface, labels: value.labels, point: value.point };
  } catch { return null; }
}

export function readViewerSession(): ViewerSession | null {
  try { return parseViewerSession(window.sessionStorage.getItem(VIEWER_SESSION_KEY)); }
  catch { return null; }
}

export function saveViewerSession(change: Partial<ViewerSession>): void {
  try {
    const next = parseViewerSession(JSON.stringify({ ...DEFAULT_VIEW, ...readViewerSession(), ...change }));
    if (next) window.sessionStorage.setItem(VIEWER_SESSION_KEY, JSON.stringify(next));
  } catch { /* Storage may be unavailable; navigation must still work. */ }
}

// Approximate scale transfer between engines; their camera models are different.
export const rangeForZoom = (zoom: number) => Math.max(200, Math.min(25_000_000, 16_000 * 2 ** (10.5 - zoom)));
export const zoomForRange = (range: number) => Math.max(0, Math.min(18, 10.5 - Math.log2(Math.max(200, range) / 16_000)));
