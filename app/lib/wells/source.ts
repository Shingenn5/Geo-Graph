export const UTAH_WELL_SOURCE = {
  name: "Utah Oil Gas Wells",
  organization: "Utah Geospatial Resource Center (UGRC) and Utah Division of Oil, Gas and Mining (DNR-OGM)",
  datasetUrl: "https://gis.utah.gov/products/sgid/energy/oil-gas-wells/",
  serviceUrl: "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/viewAGRC_WellData_Surf/FeatureServer/0",
  attribution: "Utah Oil Gas Wells, UGRC SGID / DNR-OGM (data queried and distance-filtered); CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  updatedCadence: "Nightly",
  maxServiceRecords: 2000,
  // This layer contains Utah surface locations only; it is not a national well inventory.
  coverage: "Utah surface locations of oil and gas wells",
} as const;
