export type Surface = "Natural" | "Clear imagery" | "Bare Earth" | "Geology" | "Soil" | "Land cover" | "USGS relief";
export const SURFACES: Surface[] = ["Natural", "Clear imagery", "Bare Earth", "Geology", "Soil", "Land cover", "USGS relief"];
export const TEST_PLACES = [
  { name: "Grand Canyon", longitude: -112.112, latitude: 36.106, height: 16000 },
  { name: "New York", longitude: -73.9857, latitude: 40.7484, height: 6000 },
  { name: "Rural Nevada", longitude: -116.6, latitude: 39.2, height: 14000 },
  { name: "Rural Wyoming", longitude: -108.2, latitude: 43.5, height: 14000 },
  { name: "Uinta Basin", longitude: -109.99532, latitude: 40.31459, height: 9000 },
  { name: "Patagonia", longitude: -73.2, latitude: -46.6, height: 14000 },
  { name: "Australian Outback", longitude: 133.9, latitude: -24.6, height: 14000 },
  { name: "Sahara", longitude: -5.5, latitude: 30.5, height: 14000 },
];
export const WORLDCOVER_LAYER = "esa-worldcover-map-10m-2021-v2_map";
export const OVERTURE_BUILDINGS = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.0/buildings.pmtiles";
export const CLEAR_IMAGERY_URL = "https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SURFACE_DETAILS: Record<Surface, string> = {
  Natural: "Esri imagery over Re:Earth / Mapterhorn terrain. Imagery detail varies by location.",
  "Clear imagery": "Esri World Imagery (Clarity) archive. It may look clearer in some places, but can be older or identical to current imagery. Native detail varies; no new resolution is created.",
  "Bare Earth": "Elevation-colored terrain. Colors represent height, not rock type or measured soil color.",
  Geology: "Macrostrat and original survey authors · CC BY 4.0. Mapped surface geology; map scale varies.",
  Soil: "USDA SSURGO map units · U.S. survey coverage. A map unit can contain several soil components.",
  "Land cover": "ESA WorldCover 2021 · 10 m classification · CC BY 4.0. Historical land cover, not live imagery. Tree cover, shrubland, grassland, cropland, built-up, bare ground, snow/ice, water, wetland, mangroves and moss/lichen.",
  "USGS relief": "USGS 3DEP multidirectional hillshade · U.S. coverage. This image shows USGS relief; the underlying 3D mesh remains Re:Earth terrain.",
};
