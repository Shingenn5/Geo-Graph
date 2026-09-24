# Geo Graph

Geo Graph is a field survey workspace for exploring terrain and inspecting mapped ground evidence. Its standard viewer uses MapLibre; an optional enhanced 3D trial uses Cesium. The Uinta Basin pilot connects soil, surface geology, Utah oil and gas well records, and a separately sourced research core. It shows the evidence behind a result, including missing data and interpretation limits.

Country, state, and city labels help orient the map. The **World**, **Region**, and **Ground** controls change scale while keeping the current location centered. The map-center readout shows an approximate state and country when reverse geocoding is available, and coordinates otherwise.

## Quick start

The [hosted Geo Graph preview](https://geo-graph-rocks.elliottdavis05.chatgpt.site/) is currently available to the site owner. To run your own copy on Windows, install [Node.js 22.13 or newer](https://nodejs.org/), then double-click [Install Geo Graph.cmd](Install%20Geo%20Graph.cmd) and [Start Geo Graph.cmd](Start%20Geo%20Graph.cmd) from an extracted or cloned project folder. The launcher opens the app at `http://127.0.0.1:5173`.

`main` is the repository's primary development branch. Local installation runs from your checkout; updating GitHub does not update an already deployed Site automatically. See [Run locally](#run-locally) for command-line setup and troubleshooting.

## Viewers

The standard MapLibre viewer opens by default. Its layer changes retain the previous map while the next view loads. Search for a place or coordinates, click **Select ground** to inspect a point, or use **Select area** for an area survey. Optional buildings, contours, and the close-range material study are available in this viewer.

Choose **Try enhanced 3D** to open the separate Cesium trial. It offers natural imagery, elevation coloring, mapped geology, soil map units, ESA WorldCover 2021, and a USGS 3DEP hillshade. You can orbit, pan, zoom, use place presets, toggle labels, and click terrain to inspect ground evidence. Return using **Standard viewer**.

The trial still uses Re:Earth/Mapterhorn global terrain. USGS relief is a hillshade overlay, not a 3DEP terrain mesh. Imagery and thematic coverage vary by place, and cold layer loads depend on their source services. The Cesium trial supplements the standard viewer; it does not replace its area selection and well workflows. See the [viewer rollout notes](docs/viewer-rollout.md) for sources, performance measurements, and remaining quality gates.

## Run locally

### Windows: install and open

1. Install Node.js 22.13 or newer with npm. Reopen your terminal after installing it.
2. Extract or clone this project into a writable folder. Double-click **Install Geo Graph.cmd**. The installer downloads the locked dependencies and prepares both viewers' map assets.
3. Double-click **Start Geo Graph.cmd**. Your browser opens when the local app is ready. Keep the launcher window open while using the app; press Ctrl+C to stop it.

The Start launcher also runs setup if dependencies are missing or the package lock, package settings, Node version, or platform changed. Ordinary launches reuse the installation. No administrator launch, Docker, or cloud account is required. Internet access is needed for initial installation and external map/data services; this is not an offline map package.

### Command-line setup (Windows, macOS, Linux)

```sh
npm run setup
npm run launch
```

In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`. `npm run launch -- --no-browser` starts without opening a browser. The local launcher uses the development server at `http://127.0.0.1:5173`; it does not publish changes or install a native desktop executable.

### Troubleshooting

- Run `npm run doctor` to check Node and installation readiness.
- Rerun `npm run setup` to repair an incomplete installation. Stop the local server first; setup replaces dependencies with the lockfile versions.
- If downloads fail, check your network/proxy settings and retry. Setup stops on failure and never marks that attempt successful.
- If port 5173 is occupied, close the previous launcher or run `npm run dev -- --port 5174` and use the printed URL.
- Run launchers from the extracted project, not from inside a ZIP archive. Error windows remain open so messages can be read.

For development, `npm run dev` remains available. Check types with `npx tsc --noEmit` and build with `npm run build`. On Node.js 24 or newer, run focused tests with `node --test app/lib/selection/geometry.test.ts app/lib/logs/las.test.ts`.

## Pilot workflow

Select **Explore Uinta Basin public-data pilot** to open a public well pad near Roosevelt, Utah. The shortcut selects a point and loads the current published soil, surface geology, and nearby Utah oil and gas well records. The Wellsite view displays those wells on the map and lists the nearest records. Selecting a listed well moves the map to its published surface location.

Use **Select ground** for a point survey or **Select area** for a two-corner rectangle. Point exports include a printable evidence report, JSON, and GeoJSON with source details. Area exports contain geometry and a WGS84 ellipsoid area calculation; they do not claim that soil or geology is uniform inside the polygon. The existing full soil-profile report remains available when SSURGO returns one.

The Wellsite view also links a [Utah Geological Survey Skyline 16 core log and collection article](https://geology.utah.gov/map-pub/survey-notes/core-center-news/lacustrine-teaching-tool/). Its approximate Mahogany bed depth can be selected on a depth track. The core is regional research context, with no asserted coordinate match to the selected public well. A local LAS 2.0 file can be opened for a depth-curve preview; it stays in the browser session and is not automatically associated with any well or core.

## Published data and display

- Standard viewer: MapLibre globe, Mapterhorn terrain, and Esri World Imagery by default. USGS NAIP Plus aerial imagery is an optional U.S. overlay because its coverage and visual quality can vary; the Esri underlay remains visible when it is off or unavailable. Bare Earth and USGS topo provide non-satellite views. Enhanced 3D data sources and their coverage limits are listed in the [viewer rollout notes](docs/viewer-rollout.md).
- Macrostrat mapped surface geology with original survey references, USDA NRCS SSURGO map-unit/component/horizon lookup, and USGS Quaternary fault display.
- [UGRC Utah Oil Gas Wells](https://gis.utah.gov/products/sgid/energy/oil-gas-wells/) public surface locations, credited to UGRC SGID and Utah DNR-OGM. The API filters flagged confidential records and separates an empty result from an upstream failure.
- Optional buildings, contour lines, and a close-range Three.js material study. The material study adds illustrative rock texture on steep DEM-derived terrain while preserving aerial imagery elsewhere; its visual materials are not a geological classification.

The [Uinta pilot coverage audit](docs/uinta-pilot-coverage.md) records data sources, verified point results, coverage gaps, licensing notes, and elevation/datum limits.

## Interpretation limits

SSURGO represents mapped soil units, not a sample collected at the clicked point. Macrostrat units are mapped surface interpretations, not depth-ordered strata. The Utah well layer covers oil and gas **surface** locations in that state; it is not a national well inventory or a well trajectory dataset. LAS depth is source-reported and remains MD/TVD and datum-unknown unless independently established. The Skyline 16 core has not been tied to a displayed well. Imagery pixels and rendered terrain mesh density do not establish the resolution or vertical datum of the underlying elevation survey.

The close-range renderer is still one adaptive material patch with edge fade. A tile-streamed local scene, confirmed site-specific DEM/source imagery metadata, validated borehole ties, and any underground cutaway remain future work.
