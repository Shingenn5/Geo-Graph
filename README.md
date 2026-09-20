# Geo Graph

React / MapLibre 3D terrain explorer with a small plain CSS stylesheet.

## Development

Install with `npm ci`, then run `npm run dev`. Build with `npm run build`.

## Data layers

- Esri World Imagery satellite basemap.
- USGS topographic basemap (United States).
- Mapzen Terrarium elevation tiles with explicit Terrarium decoding; exaggeration is displayed in the UI.
- Macrostrat cartographic surface geology with click-through original survey references.
- USGS Quaternary faults (U.S. coverage; not a complete inventory of every fault).
- Photon / OpenStreetMap for submitted location searches; coordinate input also works.

Third-party services require a network connection and may have coverage gaps or usage limits. Lookup failures and absent records are distinct UI states. Overlapping survey records are not interpreted as depth-ordered strata. Basemaps are draped over an elevation mesh, not underground volumes.

## Future underground cutaway

A cutaway requires a regional geological model or borehole-derived horizons with verified vertical datum, depth units, confidence, and provenance. Add a separate depth dataset and renderer; do not extrude surface polygons to invented depths. Current functionality intentionally stops at 3D terrain and mapped surface data.
