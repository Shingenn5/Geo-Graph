# Demo readiness — 2026-09-30

Validated locally on Windows with Node.js 24.19.0 and the production server at
`http://127.0.0.1:8789`. Follow [the interview guide](interview-demo.md) to rehearse.

## Checks completed

- 29 unit and API regression tests pass, including unavailable versus empty soil
  coverage, cached layer coverage, profile timeout/retry, cancellation, missing
  elevations, CSV metadata, area geometry, LAS parsing, and viewer session state.
- TypeScript, ESLint, production build, and viewer asset/isolation checks pass.
  Cesium remains a separate lazy bundle; the standard viewer does not load it.
- All 11 live preflight checks pass: health, pilot soil, geology, wells,
  provenance, search, empty soil coverage, a pilot geology PNG, and three invalid
  input cases. The preflight saved a timestamped pilot report and raw responses.
- Browser rehearsal: Uinta point evidence, public wells, geology and soil layers,
  Bare Earth, a 6.07 ha area with five successful soil and five successful geology
  lookups, and point/layer continuity when entering enhanced 3D.
- Enhanced 3D: World/Region navigation, Grand Canyon natural imagery, a 5.89 km
  profile with 129 heights, keyboard slider reaching sample 128, and CSV export
  preparation. The final enhanced rehearsal reported no browser console errors.
- The demo launcher starts the production server and safely reuses an existing
  healthy server when invoked again.

## Presentation limits

The map and live evidence still require internet and functioning upstream
services. Preflight results are a snapshot, not an uptime promise. Optional layers
and every possible location were not exhaustively tested. Areas, profiles, and
LAS files are not restored after changing viewers.

The embedded browser's download automation did not complete file downloads.
Export preparation and persistent Save links were verified, and report/CSV
generation was checked independently. Perform one manual report and CSV save in
the browser used for the presentation. The preflight already writes a local
`outputs/demo-readiness/pilot-survey.html` backup without browser downloading.

The local build is the validated presentation artifact. Pushing GitHub does not
publish a new hosted Site deployment.
