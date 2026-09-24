# Viewer quality and data rollout

## Shipped scope

The standard MapLibre viewer remains the default. Its point lookups use a bounded,
expiring cache, and layer changes keep the previous surface visible until the
requested source has loaded tiles for the current view. Superseded requests cannot
replace a newer selection. Country/place labels and road/waterway context remain
separate from thematic data.

The **Try enhanced 3D** link opens `/viewer`, an isolated Cesium trial. Cesium is
loaded dynamically only on that route. It uses request-driven rendering, bounded
terrain and imagery caches, lower terrain detail during camera movement, and short
layer fades. Returning to the standard viewer releases the trial renderer.

The trial supports terrain inspection, search, place presets, navigation scales,
reference labels, natural imagery, elevation coloring, surface geology, soil map
units, land cover, and USGS relief. Area selection and existing well workflows
remain in the standard viewer.

## Data sources and limits

- **Terrain:** Re:Earth quantized mesh derived from Mapterhorn, using the
  ellipsoidal-height endpoint. Resolution and availability vary. This is not a
  survey-grade local 3DEP mesh.
- **Natural imagery and labels:** Esri World Imagery and World Boundaries and
  Places. Native resolution varies; rendering cannot invent detail in remote
  imagery. Source credits remain visible.
- **Geology:** existing Macrostrat proxy and source survey attribution, CC BY 4.0.
  These are mapped surface units, not measured subsurface layers.
- **Soils:** USDA NRCS SSURGO map units and existing point queries. Coverage is
  survey-dependent; a map unit can contain several components.
- **Land cover:** ESA WorldCover 2021, 10 m classification, CC BY 4.0, via
  Terrascope WMS. This is historical classification, not live imagery.
- **USGS relief:** 3DEP multidirectional hillshade through a fixed-source,
  validated same-origin tile endpoint. It changes imagery, not terrain geometry.
  Current trial coverage is the contiguous U.S.
- **Overture buildings:** optional standard-viewer inspection layer, pinned to
  the 2026-09-23.0 PMTiles release. It loads only when enabled and zoomed in.
  Heights may be estimated where source heights are missing. These inspection
  tiles are not a production basemap guarantee.

Point inspection loads soil, geology, and elevation independently. The trial's
elevation-only provenance request avoids waiting for the unrelated imagery
catalog. Unknown datum, unavailable records, and no-record results remain distinct.

## Verification

Local production builds were compared against unchanged commit
`447a6013291326516a8fea2e13e7b64e6b90178a` using headless Microsoft Edge at
1440 x 1000. Two initial runs measured standard-viewer readiness at 1.70–1.88 s
versus 2.24–3.29 s for the baseline. Standard-route transferred JavaScript grew
by about 3.3 KB (less than 1%); the Cesium runtime was absent from that route.
These are local smoke measurements, not field performance guarantees.

Cesium cold layer changes in these runs took approximately 4.4–4.7 s for geology,
1.2–1.4 s for soil, 2.0–2.6 s for land cover, and 7.5 s for USGS hillshade.
Returning to natural imagery took about 0.19 s; repeat geology took 0.64–0.80 s.
Upstream latency remains visible. Camera frame timing varied between runs;
no universal frame-rate or sub-second cold-transition claim is made.

Interaction checks cover standard layer changes, rapid superseding selections,
Overture HTTP range loading, retaining the previous Cesium surface during a source
outage, and a 390 px mobile layout. Automated checks also cover bounded cache
eviction/expiry, abort handling, stale transition rejection, positive source
coverage, independent elevation provenance, and existing geometry/area/LAS logic.

Reproduce with a local production server and an installed Playwright browser:

```sh
node --test app/lib/viewer/*.test.ts app/lib/selection/*.test.ts app/lib/logs/*.test.ts
npx tsc --noEmit
npm run build
node scripts/check-viewer-build.mjs
node scripts/test-viewer-interactions.mjs http://127.0.0.1:8787
node scripts/benchmark-viewer.mjs http://127.0.0.1:8788 http://127.0.0.1:8787
```

Set `PLAYWRIGHT_MODULE` to an existing Playwright module when it is not installed
locally, and optionally `BROWSER_CHANNEL=msedge`. Benchmark URLs must point to
separate baseline and candidate production builds. Outputs go under ignored
`outputs/viewer-qa/`. Local bounded metrics are available on
`window.geoGraphMetrics`; they are not sent to a telemetry service.

## Remaining gates

Regional 3DEP terrain conversion, datum validation, prepared production tile
archives, and broader low-end/mobile GPU benchmarks remain subsequent work.
The Cesium trial must pass those quality and performance gates before replacing
the standard viewer. This rollout does not claim the entire staged migration is
complete. Reverting the rollout commit restores the previous default behavior.
