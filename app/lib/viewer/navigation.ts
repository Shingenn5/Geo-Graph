export const GLOBE_ENTER_ZOOM = 4.5;
export const TERRAIN_ENTER_ZOOM = 5.25;
export const MAX_TERRAIN_PITCH = 60;

/** Globe tilt translates the planet away from the screen center. Keep it face-on at world scale. */
export function maxPitchForZoom(zoom: number) {
  return MAX_TERRAIN_PITCH * Math.max(0, Math.min(1, (zoom - GLOBE_ENTER_ZOOM) / (9 - GLOBE_ENTER_ZOOM)));
}

/** Limit changes clamp existing pitch too, including restored cameras and a manual zoom-out. */
export function constrainMapCamera(map: { getZoom(): number; getMaxPitch(): number; setMaxPitch(pitch: number): unknown }) {
  const limit = maxPitchForZoom(map.getZoom());
  if (Math.abs(map.getMaxPitch() - limit) > 0.001) map.setMaxPitch(limit);
}

/** Conservative sphere framing, accounting for the renderer's latitude-dependent globe radius. */
export function worldZoom(width: number, height: number, latitude: number) {
  const radius = Math.max(1, Math.min(width, height)) * 0.36;
  const cosine = Math.cos(Math.min(85, Math.abs(latitude)) * Math.PI / 180);
  return Math.max(0, Math.min(2, Math.log2(radius * 2 * Math.PI * cosine / 512)));
}
