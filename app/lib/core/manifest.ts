import type { CoreManifest } from "./types";

/**
 * Small, source-linked public pilot. The published UGS plate is linked rather
 * than copied because redistribution rights for its figures were not assessed.
 */
export const CORE_MANIFEST = {
  schemaVersion: 1,
  scope: "A single documented Uinta Basin research core; not a basin-wide inventory.",
  records: [
    {
      id: "ugs-skyline-16",
      wellName: "Skyline 16",
      basin: "Uinta Basin",
      state: "Utah",
      county: "Uintah",
      operator: "Utah Geological Survey / University of Utah",
      locationDescription: "Section 10, T. 11 S., R. 25 E., SLBLM; UTM E 661445, N 4415109 (NAD 83), as printed on UGS Special Study 147, Plate 17.",
      coordinates: null,
      formation: "Green River Formation, Douglas Creek and Parachute Creek Members",
      drilledYear: 2010,
      coreRepository: "Utah Core Research Center (UCRC)",
      intervalDepth: {
        unit: "ft",
        reference: "source_reported_core_depth",
        sourceLabel: "Depth (ft)",
        mdOrTvd: "not_stated",
        datum: "not_stated",
      },
      intervals: [
        {
          from: 20,
          to: 1006,
          depth: {
            unit: "ft",
            reference: "source_reported_core_depth",
            sourceLabel: "Depth (ft)",
            mdOrTvd: "not_stated",
            datum: "not_stated",
          },
          kind: "cored_interval",
          description: "Cored interval reported as slabbed; the source log spans 20–1006 ft.",
        },
      ],
      observations: [{
        id: "mahogany-bed",
        label: "Mahogany bed",
        approximateDepthFeet: 460,
        description: "UGS describes organic-rich Mahogany bed material at about 460 feet in this core. This is an approximate article depth, not a digitized sample interval.",
        sourceUrl: "https://geology.utah.gov/map-pub/survey-notes/core-center-news/lacustrine-teaching-tool/",
      }],
      assets: [
        {
          id: "ugs-ss147-plate17",
          title: "Skyline 16 core log (Special Study 147, Plate 17)",
          type: "core_log",
          url: "https://ugspub.nr.utah.gov/publications/special_studies/ss-147/ss-147_plates.pdf",
          access: "public_link",
          redistribution: "link_only_rights_not_assessed",
          sourceId: "ugs-ss147-plate17-source",
          notes: "Plate includes a graphic core log and gamma-ray, bulk-density, caliper, and resistivity curves. Depth axis is labeled in feet; MD/TVD and datum are not stated.",
        },
        {
          id: "ugs-skyline16-core-photo-context",
          title: "Skyline 16 core photographs and collection context",
          type: "core_photography",
          url: "https://geology.utah.gov/map-pub/survey-notes/core-center-news/lacustrine-teaching-tool/",
          access: "public_link",
          redistribution: "link_only_rights_not_assessed",
          sourceId: "ugs-skyline16-article-source",
          notes: "UGS article presents core imagery, including the Mahogany bed near 460 ft and stromatolites at 972.8 ft. Linked to the article; no image is copied into this application.",
        },
      ],
      sources: [
        {
          id: "ugs-ss147-plate17-source",
          title: "Geological Characterization of the Birds Nest Aquifer, Uinta Basin, Utah — Plate 17, Skyline 16 Core Log",
          organization: "Utah Geological Survey",
          url: "https://ugspub.nr.utah.gov/publications/special_studies/ss-147/ss-147_plates.pdf",
          role: "primary_core_log",
          access: "public_link",
          redistribution: "link_only_rights_not_assessed",
        },
        {
          id: "ugs-skyline16-article-source",
          title: "Core Center News: Skyline 16 Green River Formation Core — World Class Lacustrine Teaching Tool",
          organization: "Utah Geological Survey",
          url: "https://geology.utah.gov/map-pub/survey-notes/core-center-news/lacustrine-teaching-tool/",
          role: "collection_context",
          access: "public_link",
          redistribution: "link_only_rights_not_assessed",
        },
      ],
      provenance: [
        "UGS Special Study 147, Plate 17 identifies well name Skyline 16, operator UGS–University of Utah, township/range/section, UTM coordinates with NAD83, drilled year 2010, repository UCRC, and cored interval 20–1006 ft (slabbed).",
        "UGS labels the plate's vertical scale 'Depth (ft)' and does not specify measured depth, true vertical depth, or a depth datum. The API therefore preserves source-reported core depth and does not claim MD/TVD.",
        "UGS's Skyline 16 article states 1000 feet of continuous core was recovered and describes identifiable core features; it also links this entry to public core photography without asserting photo reuse rights.",
      ],
      limitations: [
        "This is one documented research core, not a comprehensive Uinta Basin dataset.",
        "Depth reference and datum are not specified by the cited log. Do not merge these depths with well-log MD/TVD values without an independently sourced depth tie.",
        "Figures and photographs are linked at their original UGS pages; this project has not established permission to redistribute copies.",
        "The section/township location and the printed UTM values are retained as source text; no derived latitude/longitude is asserted.",
      ],
    },
  ],
} as const satisfies CoreManifest;
