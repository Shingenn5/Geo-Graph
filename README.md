# Geo Graph

React / MapLibre globe, 3D terrain, city-building, and surface-geology explorer with a small plain CSS stylesheet.

## Development

Install with `npm ci`, then run `npm run dev`. Build with `npm run build`.

## Data layers

- Esri World Imagery satellite basemap.
- USGS topographic basemap (United States).
- Mapzen Terrarium elevation tiles with explicit Terrarium decoding; exaggeration is displayed in the UI.
- OpenFreeMap vector buildings from OpenStreetMap, extruded from mapped heights at city scale.
- Macrostrat cartographic surface geology with click-through original survey references.
- USGS Quaternary faults (U.S. coverage; not a complete inventory of every fault).
- Photon / OpenStreetMap for submitted location searches; coordinate input also works.

Third-party services require a network connection and may have coverage gaps or usage limits. Lookup failures and absent records are distinct UI states. Overlapping survey records are not interpreted as depth-ordered strata. Basemaps are draped over an elevation mesh, not underground volumes.

The camera begins on a MapLibre globe and changes to a Mercator terrain view for close exploration. Relief and 3D buildings are selectable visual modes: terrain is enabled for landform exploration, while city scale switches to building extrusion so MapLibre does not render both depth buffers over the same scene. Geology and fault overlays remain independently selectable.

## Future underground cutaway

A cutaway requires a regional geological model or borehole-derived horizons with verified vertical datum, depth units, confidence, and provenance. Add a separate depth dataset and renderer; do not extrude surface polygons to invented depths. Current functionality intentionally stops at 3D terrain and mapped surface data.
