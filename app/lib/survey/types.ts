/**
 * Shared, UI-independent contracts for a point-based Geo Graph field survey.
 *
 * Values from map services are observations of published map records, not
 * on-site measurements. Derived values must identify their method; illustrative
 * values must never be confused with observed evidence.
 */
export type EvidenceKind = "observed" | "derived" | "illustrative";
export type EvidenceStatus = "available" | "unavailable" | "not-queried" | "no-record";
export type EvidenceDomain = "soil" | "geology" | "well" | "context";

export type Provenance = {
  kind: EvidenceKind;
  source: string;
  /** URL to a source record, API, or documentation when available. */
  href?: string;
  /** Description of any calculation or interpretation. */
  method?: string;
  retrievedAt?: string;
};

export type EvidenceValue<T = unknown> = {
  domain: EvidenceDomain;
  label: string;
  value: T | null;
  status: EvidenceStatus;
  provenance: Provenance;
  /** Null means the source did not publish a value; it does not mean zero. */
  note?: string;
};

export type SurveyCoordinates = {
  /** WGS84 longitude in decimal degrees. */
  longitude: number;
  /** WGS84 latitude in decimal degrees. */
  latitude: number;
};

/** Structural subset of /api/soil; preserves nullable values from SSURGO. */
export type SoilEvidence = {
  mapUnitKey?: string | null;
  mapUnitSymbol?: string | null;
  mapUnitName?: string | null;
  surveyAreaSymbol?: string | null;
  surveyAreaName?: string | null;
  surveyMatchCount?: number | null;
  componentName?: string | null;
  componentKind?: string | null;
  majorComponent?: boolean | null;
  componentPercent?: number | null;
  taxonomicOrder?: string | null;
  taxonomicSubgroup?: string | null;
  taxonomicClass?: string | null;
  drainageClass?: string | null;
  hydrologicGroup?: string | null;
  slopeLowPercent?: number | null;
  slopePercent?: number | null;
  slopeHighPercent?: number | null;
  runoffClass?: string | null;
  hydricRating?: string | null;
  hydricCondition?: string | null;
  floodingFrequency?: string | null;
  pondingFrequency?: string | null;
  concreteCorrosion?: string | null;
  steelCorrosion?: string | null;
  frostAction?: string | null;
  nonIrrigatedCapabilityClass?: string | null;
  irrigatedCapabilityClass?: string | null;
  restrictionKind?: string | null;
  restrictionDepthCm?: number | null;
  profileAvailableWaterStorageMm?: number | null;
  horizonName?: string | null;
  horizonTopCm?: number | null;
  horizonBottomCm?: number | null;
  texture?: string | null;
  sandPercent?: number | null;
  siltPercent?: number | null;
  clayPercent?: number | null;
  rockFragmentsPercent?: number | null;
  organicMatterPercent?: number | null;
  ph?: number | null;
  availableWaterCapacity?: number | null;
  permeability?: string | null;
  horizons?: SoilHorizonEvidence[];
};

export type SoilHorizonEvidence = {
  key?: string;
  name?: string | null;
  topCm?: number | null;
  bottomCm?: number | null;
  texture?: string | null;
  sandPercent?: number | null;
  siltPercent?: number | null;
  clayPercent?: number | null;
  rockFragmentsPercent?: number | null;
  organicMatterPercent?: number | null;
  ph?: number | null;
  availableWaterCapacity?: number | null;
  saturatedHydraulicConductivity?: number | null;
  bulkDensity?: number | null;
  erosionKFactor?: number | null;
  liquidLimit?: number | null;
  plasticityIndex?: number | null;
  cationExchangeCapacity?: number | null;
  electricalConductivity?: number | null;
};

/** Structural subset of Macrostrat map units returned by /api/geology. */
export type GeologyUnitEvidence = {
  map_id?: number;
  source_id?: number;
  name?: string | null;
  strat_name?: string | null;
  lith?: string | null;
  descrip?: string | null;
  color?: string | null;
  best_int_name?: string | null;
  t_int_name?: string | null;
  b_int_name?: string | null;
  [key: string]: unknown;
};

/** Optional well record from a published source; depth requires an explicit datum. */
export type WellEvidence = {
  id?: string;
  name?: string | null;
  source: string;
  sourceUrl?: string;
  longitude?: number | null;
  latitude?: number | null;
  depthMeters?: number | null;
  waterLevelMeters?: number | null;
  use?: string | null;
  status?: string | null;
  observedAt?: string | null;
  attributes?: Record<string, string | number | boolean | null>;
};

export type SurveySelectionInput = {
  coordinates: SurveyCoordinates;
  selectedAt?: string;
  /** `null` with status `unavailable` differs from a lookup not yet attempted. */
  soil?: { status: EvidenceStatus; data?: SoilEvidence | null; source?: string; retrievedAt?: string };
  geology?: { status: EvidenceStatus; units?: GeologyUnitEvidence[]; refs?: Record<string, string>; source?: string; retrievedAt?: string };
  wells?: { status: EvidenceStatus; records?: WellEvidence[]; source?: string; retrievedAt?: string };
  /** Optional map/building/search context, clearly kept separate from field evidence. */
  context?: Array<{ label: string; value: string | number | boolean | null; source: string; kind?: EvidenceKind; method?: string }>;
};

export type SurveySelection = {
  schema: "geo-graph-survey/v1";
  coordinates: SurveyCoordinates;
  coordinateReferenceSystem: "OGC:CRS84";
  selectedAt: string;
  evidence: EvidenceValue[];
  sources: Provenance[];
};
