# Geo Graph

Geo Graph is a React and MapLibre field survey workspace. It uses a globe at broad zoom, reveals three-dimensional terrain at regional scale, and lets users inspect published ground evidence at a selected location. The Uinta Basin pilot connects soil, surface geology, Utah oil and gas well records, and a separately sourced research core. It shows the evidence behind a result, including missing data and interpretation limits.

## Run locally

Use Node.js 22.13 or newer for the app. Run `npm ci`, then `npm run dev`. Check types with `npx tsc --noEmit` and build with `npm run build`. On Node.js 24 or newer, run focused tests with `node --test app/lib/selection/geometry.test.ts app/lib/logs/las.test.ts`.

## Pilot workflow

Select **Explore Uinta Basin public-data pilot** to open a public well pad near Roosevelt, Utah. The shortcut selects a point and loads the current published soil, surface geology, and nearby Utah oil and gas well records. The Wellsite view displays those wells on the map and lists the nearest records. Selecting a listed well moves the map to its published surface location.

Use **Select ground** for a point survey or **Select area** for a two-corner rectangle. Point exports include a printable evidence report, JSON, and GeoJSON with source details. Area exports contain geometry and a WGS84 ellipsoid area calculation; they do not claim that soil or geology is uniform inside the polygon. The existing full soil-profile report remains available when SSURGO returns one.

The Wellsite view also links a [Utah Geological Survey Skyline 16 core log and collection article](https://geology.utah.gov/map-pub/survey-notes/core-center-news/lacustrine-teaching-tool/). Its approximate Mahogany bed depth can be selected on a depth track. The core is regional research context, with no asserted coordinate match to the selected public well. A local LAS 2.0 file can be opened for a depth-curve preview; it stays in the browser session and is not automatically associated with any well or core.

## Published data and display

- MapLibre globe, Mapterhorn terrain, Esri World Imagery, and optional USGS NAIP Plus aerial imagery. The aerial layer can fail independently while the Esri underlay remains visible.
- Macrostrat mapped surface geology with original survey references, USDA NRCS SSURGO map-unit/component/horizon lookup, and USGS Quaternary fault display.
- [UGRC Utah Oil Gas Wells](https://gis.utah.gov/products/sgid/energy/oil-gas-wells/) public surface locations, credited to UGRC SGID and Utah DNR-OGM. The API filters flagged confidential records and separates an empty result from an upstream failure.
- Optional buildings, contour lines, and a close-range Three.js material study. The material study adds illustrative rock texture on steep DEM-derived terrain while preserving aerial imagery elsewhere; its visual materials are not a geological classification.

The [Uinta pilot coverage audit](docs/uinta-pilot-coverage.md) records data sources, verified point results, coverage gaps, licensing notes, and elevation/datum limits.

## Interpretation limits

SSURGO represents mapped soil units, not a sample collected at the clicked point. Macrostrat units are mapped surface interpretations, not depth-ordered strata. The Utah well layer covers oil and gas **surface** locations in that state; it is not a national well inventory or a well trajectory dataset. LAS depth is source-reported and remains MD/TVD and datum-unknown unless independently established. The Skyline 16 core has not been tied to a displayed well. Imagery pixels and rendered terrain mesh density do not establish the resolution or vertical datum of the underlying elevation survey.

The close-range renderer is still one adaptive material patch with edge fade. A tile-streamed local scene, confirmed site-specific DEM/source imagery metadata, validated borehole ties, and any underground cutaway remain future work.
