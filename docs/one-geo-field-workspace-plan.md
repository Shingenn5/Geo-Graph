# One Geo field-workspace plan

## Why this pilot exists

[One Geo](https://www.one-geo.com/) combines field gas instruments, XRF, laboratory rock and fluid analysis, and its [Live-Log](https://www.one-geo.com/) depth-based interpretation software. [Epoch Geoservices](https://www.epochgeoservices.com/) says it deploys One Geo's Spec at the wellsite; Epoch's [operator testimonials](https://www.epochgeoservices.com/testimonials) describe the value of mud-gas, XRF, cuttings images, and geosteering for XCL Resources, Wasatch Energy Management, and Enduring Resources. These are Epoch's reported operator relationships, **not** a claim that those operators are direct One Geo customers.

Geo Graph's useful niche is the spatial context around those depth-based workflows: orient a wellsite on real terrain, select the ground and nearby public records, then inspect an explicitly sourced depth track. Its terrain material is a visualization; it cannot identify rock chemistry from a satellite pixel.

## Pilot use cases and proof

| User task | Useful decision | Current proof | Next proof required |
|---|---|---|---|
| Wellsite orientation | Check access terrain, surface geology, faults, soil, and nearby public wells before field work. | Uinta Basin public-pad shortcut, 3D terrain, mapped layers, point report and source citations. | Verify site-specific imagery acquisition and DEM resolution/datum; add repeatable capture of map state to report. |
| Compare candidate pad footprints | Bound an area and see where published evidence varies before a field visit. | Two-corner WGS84 area geometry and GeoJSON export. | Bounded source sampling or actual intersected polygons with coverage/uncertainty displayed; no claims of homogeneous soils from one pin. |
| Review a nearby well | Open agency surface location, operator/status, and source record. | Live Utah oil/gas surface records and distance-sorted list. | Add verified well identity/trajectory/depth references before correlating any log. |
| Interpret rock and gas by depth | Compare logs, core images, XRF, and other measurements on a common depth axis. | Source-linked UGS Skyline 16 research-core track and session-only LAS 2.0 curve preview. | Obtain public/licensed same-well data, verify MD/TVD/datum and well tie, then add aligned tracks and image permissions. |
| Hand off a defensible survey | Export what was observed, derived, missing, and illustrative. | Printable point report, JSON/GeoJSON, full soil report. | Add source capture times, map snapshot, bounded-area summary, and offline/failed-source indicators. |

## Execution order and acceptance gates

1. **Pilot evidence contract — implemented.** Preserve source URL, time, status, and location for each record. Treat no mapped record, not queried, service unavailable, and partial/limited coverage distinctly. The [coverage audit](uinta-pilot-coverage.md) gives point-specific results and gaps. Acceptance: reports cannot turn a failed lookup into a negative geological finding.
2. **Terrain quality — underway.** Keep globe at broad distance and MapLibre terrain on approach; use high-resolution aerial imagery where its source metadata permits. Replace the bounded material-study patch with stable camera-following terrain tiles or rings, bounded texture/DEM requests, and no obvious seams or clipping. Acceptance: close orbit works across several neighboring areas without a square patch or a frame-rate collapse. PBR color/roughness remains illustrative and labeled.
3. **Area evaluation — underway.** Sample or intersect published soil/geology within a bounded selection, show coverage and nonuniformity, and export the method and every failed/empty sample. Acceptance: areas crossing a map-unit boundary do not receive a single unqualified soil verdict.
4. **Depth evidence — first slice implemented.** Keep Skyline 16 explicitly regional and LAS local/unlinked. Add a verified public well/core pair or user-supplied same-well dataset with depth-reference metadata; only then allow correlation or a cutaway. Acceptance: unknown MD/TVD or datum blocks depth alignment, and surface geology never becomes invented subsurface layers.
5. **Demonstration and release.** Run geometry/LAS/evidence tests, type/lint/build checks, local browser checks at the pilot and a no-data point, then publish the same Git commit to the owner-private Site. Acceptance: deployed version provenance matches Git HEAD and the intended audience. A recruiter-facing public link requires a separate explicit access change.

## Edge cases to retain

- Globe-to-terrain handoff near the threshold, steep slopes, terrain clipping, missing aerial tiles, and low-memory/WebGL devices.
- National soil gaps, overlapping geological surveys, outdated well status, confidential or poor-quality well coordinates, agency transfer limits, and upstream rate limits.
- Antimeridian and near-pole area geometry, tiny/zero-area selections, sparse sample coverage, and mixed map units.
- LAS null values, duplicate/nonmonotonic depths, mixed units, missing datum, malformed or oversized local files.
- Source license/attribution and image redistribution rights. Link UGS figures until their reuse rights are established.

This plan is a product demo roadmap, not a certification that the application can make drilling, construction, or environmental determinations. The product should show the evidence and its limits clearly enough for a specialist to decide what to verify next.
