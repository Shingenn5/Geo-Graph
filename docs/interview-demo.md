# Interview demo

Use the local production build on the laptop you will present from. The map and
data services require internet access; this is not an offline tile package.

## Before the interview

1. Run `npm run demo:prepare` after the last source change, with the demo server
   stopped. This builds both viewers and verifies their assets.
2. Double-click **Demo Geo Graph.cmd**, or run `npm run demo`. It opens
   `http://127.0.0.1:8789`. Keep its terminal window open. Relaunching the shortcut
   reuses a healthy Geo Graph server instead of failing on an occupied port.
3. Rehearse the sequence below on the presentation display. Allow imagery and
   terrain to finish loading. Keep a printable survey and screenshots locally as
   a backup if the venue's internet or an external data source becomes unavailable.
4. Run `npm run demo:check` just before presenting. It checks the running server
   and the live pilot sources. Repeat it on the venue's connection.
   Successful checks save a printable snapshot and raw source responses in
   `outputs/demo-readiness/`. Open `pilot-survey.html` locally for the backup.

## Five-minute sequence

1. **Standard viewer:** choose **Explore Uinta Basin public-data pilot**. Explain
   the terrain, mapped soil, surface geology, and public well records. Distinguish
   these published interpretations from an on-site measurement.
2. **Evidence:** show the soil horizons and source-quality panel. Export a
   **Printable survey** or **JSON** to demonstrate that source limits travel with
   the result.
3. **Area:** choose **Select area** and click two nearby corners. Show the area
   calculation and five point samples. Explain that these probes do not establish
   uniform conditions throughout the polygon.
4. **Enhanced 3D:** choose **Try enhanced 3D**, then **Grand Canyon**. Demonstrate
   World/Region/Ground navigation and **Bare Earth**, then return to **Natural**.
5. **Terrain profile:** select two nearby ground points, show the elevation chart,
   move its position slider, and export CSV. Heights use an ellipsoidal reference;
   this is terrain exploration, not a measured underground cross-section.

Finish by showing the standard viewer again. Location, compatible layers, labels,
and point selection persist within the same browser tab. Areas, profile charts,
local LAS files, and viewer-specific tools do not persist across viewer switches.
Exports retain a **Save** link after creation. Use it if your browser blocks the
automatic download, and save the files before switching viewers.
Manually save one printable report and one profile CSV in the browser you will
present from. See [the validation record](demo-readiness.md) for completed checks
and the embedded browser's download-verification limit.

## If a source is unavailable

The previous map layer stays visible when a replacement layer fails. Use
**Natural** or **Bare Earth** and continue with already loaded context. Enter
coordinates if place search is unavailable. A missing record and a failed service
are different states; do not describe a service outage as a negative geological
finding. Clear and redraw a profile after a timeout. Use the saved report for
source-backed evidence if the data service is unavailable.

## Development checks

On the tested Node.js 24 runtime: `npm test`, `npx tsc --noEmit`, `npm run lint`,
and `npm run demo:prepare`. Rebuild with the local production server stopped.
Publishing the repository does not update the hosted Site automatically.
