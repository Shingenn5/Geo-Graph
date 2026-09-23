export type CoreDepthReference = {
  /** Units as explicitly labeled by the source. */
  unit: "ft";
  /** The source says "Depth (ft)" but does not identify MD, TVD, or a datum. */
  reference: "source_reported_core_depth";
  sourceLabel: "Depth (ft)";
  mdOrTvd: "not_stated";
  datum: "not_stated";
};

export type CoreDepthInterval = {
  from: number;
  to: number;
  depth: CoreDepthReference;
  kind: "cored_interval";
  description: string;
};

export type CoreSource = {
  id: string;
  title: string;
  organization: string;
  url: string;
  role: "primary_core_log" | "collection_context";
  access: "public_link";
  redistribution: "link_only_rights_not_assessed";
};

export type PublicCoreRecord = {
  id: string;
  wellName: string;
  basin: "Uinta Basin";
  state: "Utah";
  county: "Uintah";
  operator: string;
  locationDescription: string;
  coordinates: null;
  formation: string;
  drilledYear: number;
  coreRepository: string;
  intervalDepth: CoreDepthReference;
  intervals: CoreDepthInterval[];
  observations: Array<{
    id: string;
    label: string;
    approximateDepthFeet: number;
    description: string;
    sourceUrl: string;
  }>;
  assets: Array<{
    id: string;
    title: string;
    type: "core_log" | "core_photography";
    url: string;
    access: "public_link";
    redistribution: "link_only_rights_not_assessed";
    sourceId: string;
    notes: string;
  }>;
  sources: CoreSource[];
  provenance: string[];
  limitations: string[];
};

export type CoreManifest = {
  schemaVersion: 1;
  scope: string;
  records: PublicCoreRecord[];
};
