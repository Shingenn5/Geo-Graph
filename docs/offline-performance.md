# Offline, appearance and performance verification

Verified locally on October 1, 2026.

- 43 automated tests passed; lint and TypeScript checks passed.
- Production build and viewer asset check passed; Cesium remains outside the standard route's static imports.
- Demo endpoint checks passed: health, pilot soil and geology, public wells, source provenance, search, no-coverage response, geological imagery, and invalid-input handling.
- Browser QA verified light/dark switching, reload persistence, shared preference between standard/enhanced viewers, and reopening downloaded app files with the local production server stopped. This is not an OS-wide internet-disconnection test.
- The service-worker harness separately disabled network fetches and verified saved app/evidence responses, timestamp retention, unavailable responses for undownloaded coordinates, credential exclusion, storage limits, quota failure reporting, and preservation of live HTTP failures.
- A Nigeria demonstration site retained 134 responses, including 47 terrain tiles; 28 requests were not saved. The interface reports partial downloads rather than claiming complete coverage. Saved Australia and Nigeria areas survived app-file updates.
- Bare Earth and lazily loaded contours rendered successfully. Browser QA caught and corrected an invalid timing attribute for the name “Bare Earth”; its regression test passes.
- Instrumented local repeat visits measured 0.53 seconds before the pass at Grand Canyon and 0.60 seconds afterward; Nigeria repeat visits measured 0.52–0.58 seconds. An earlier Nigeria visit took 2.54 seconds. These samples do not prove a general improvement or a universal two-second cold start.

## Practical boundaries

Site packs are deliberately small and share a browser-storage budget of 128 MB and 1,200 geographic responses. Zoom levels 0–14 are downloaded with a tile margin; finer views can reuse coarser parents. Whole-country packages, bulk satellite imagery, and enhanced Cesium offline assets are not included. Five evidence samples are point observations or published predictions, not uniform subsurface coverage. Supported public wells still depend on the registry integration, currently Utah.

Browser eviction can make earlier downloads incomplete. Download and verify each site before leaving connectivity, retain exported reports separately, and keep local LAS files. A new coordinate can remain unavailable offline even inside a downloaded polygon. Offline snapshot dates are preserved in evidence exports; report-generation time must not be confused with fresh retrieval.

See the README for download, installation, appearance, and offline instructions.
