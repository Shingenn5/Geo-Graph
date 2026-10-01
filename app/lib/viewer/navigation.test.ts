import assert from "node:assert/strict";
import test from "node:test";
import { constrainMapCamera, maxPitchForZoom, worldZoom } from "./navigation.ts";

test("zooming a steep terrain camera out to globe scale removes tilt without changing its heading or location", () => {
  const camera = { zoom: 12, pitch: 60, limit: 60, bearing: -37, center: [-110, 40] };
  const map = {
    getZoom: () => camera.zoom,
    getMaxPitch: () => camera.limit,
    setMaxPitch: (limit: number) => { camera.limit = limit; camera.pitch = Math.min(camera.pitch, limit); return map; },
  };
  for (const zoom of [10, 8, 6, 5.25, 4.5, 2]) { camera.zoom = zoom; constrainMapCamera(map); }
  assert.equal(camera.pitch, 0);
  assert.equal(camera.limit, 0);
  assert.equal(camera.bearing, -37);
  assert.deepEqual(camera.center, [-110, 40]);
  camera.zoom = 12; constrainMapCamera(map);
  assert.equal(camera.limit, 60);
  assert.equal(camera.pitch, 0, "Zoom-in must not automatically tilt or rotate the camera");
});

test("camera constraint is idempotent and cannot trigger a correction loop at the same zoom", () => {
  let writes = 0, limit = 75;
  const map = { getZoom: () => 2, getMaxPitch: () => limit, setMaxPitch: (value: number) => { writes++; limit = value; return map; } };
  constrainMapCamera(map); constrainMapCamera(map); constrainMapCamera(map);
  assert.equal(writes, 1);
});

test("pitch limits increase continuously from globe to local terrain", () => {
  assert.equal(maxPitchForZoom(4.5), 0);
  assert.equal(maxPitchForZoom(6.75), 30);
  assert.equal(maxPitchForZoom(9), 60);
  assert.equal(maxPitchForZoom(18), 60);
  assert.ok(Math.abs(maxPitchForZoom(5.25) - maxPitchForZoom(5.2499)) < .01);
});

test("world framing fits narrow maps and reduces zoom at higher latitudes", () => {
  const desktop = worldZoom(1100, 900, 40), phone = worldZoom(390, 520, 40);
  assert.ok(phone < desktop);
  assert.ok(worldZoom(1100, 900, 70) < desktop);
  for (const latitude of [-85, 0, 40, 85]) assert.ok(Number.isFinite(worldZoom(0, 0, latitude)));
  const radius = 512 * 2 ** phone / (2 * Math.PI * Math.cos(40 * Math.PI / 180));
  assert.ok(radius * 2 < 390, "A mobile world view should leave space around the planet");
});
