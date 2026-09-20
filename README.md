# Geo Graph

React / MapLibre globe, 3D terrain, city-building, and surface-geology explorer with a small plain CSS stylesheet.

## Development

Install with `npm ci`, then run `npm run dev`. Build with `npm run build`.

## Data layers

- Esri World Imagery satellite basemap.
- USGS topographic basemap (United States).
- Mapzen Terrarium elevation tiles with explicit Terrarium decoding and a fixed, restrained relief scale.
- OpenFreeMap vector buildings from OpenStreetMap, extruded from mapped heights at city scale.
- USDA NRCS Soil Data Access / SSURGO point lookups for map units, dominant components, representative surface horizons, drainage, hydrologic group, texture fractions, organic matter, and pH where published.
- Macrostrat cartographic surface geology with click-through original survey references.
- USGS Quaternary faults (U.S. coverage; not a complete inventory of every fault).
- Photon / OpenStreetMap for submitted location searches; coordinate input also works.

Third-party services require a network connection and may have coverage gaps or usage limits. Lookup failures and absent records are distinct UI states. Overlapping survey records are not interpreted as depth-ordered strata. Basemaps are draped over an elevation mesh, not underground volumes.

The camera begins on a MapLibre globe and changes to a Mercator terrain view for close exploration. Relief and 3D buildings are selectable visual modes: terrain is enabled for landform exploration, while city scale switches to building extrusion so MapLibre does not render both depth buffers over the same scene. Geology and fault overlays remain independently selectable. A map click creates a persistent selection ring and loads soil, geology, and building details for that location. Terrain cameras stay clamped to the ground with a limited pitch to avoid clipping through the elevation mesh.

The soil integration follows the soilDB project's recommended Soil Data Access path and uses `SDA_Get_Mukey_from_intersection_with_WktWgs84` to resolve the SSURGO map unit at the selected WGS84 point. Published fields may be blank for urban land, rock outcrop, water, or surveys without a representative value.

## Future underground cutaway

A cutaway requires a regional geological model or borehole-derived horizons with verified vertical datum, depth units, confidence, and provenance. Add a separate depth dataset and renderer; do not extrude surface polygons to invented depths. Current functionality intentionally stops at 3D terrain and mapped surface data.
