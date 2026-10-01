# Stylesheet organization

`app/globals.css` is the ordered entry point, imported by the root layout.

| File | Owns |
| --- | --- |
| `workspace.css` | Shared foundation, header, sidebar, inspector, and workspace layout |
| `dashboard.css` | Report actions, dashboard cards, use cases, and soil horizons |
| `map-controls.css` | Camera controls, map context, and surface selectors |
| `evidence-panels.css` | Wells, area evidence, core context, LAS preview, and source panels |
| `enhanced-viewer.css` | Viewer switch, layer status, and Cesium-specific presentation |
| `terrain-profile.css` | Terrain profile dock, chart, controls, and mobile layout |
| `wellsite-workspace.css` | Standard viewer field theme, wellsite layout, and LAS depth tracks; scoped to `.wellsite-workspace` |

Use one declaration per line and put new styles in the owning file. Keep
viewer-specific rules scoped to `.enhanced-viewer` and profile rules scoped to
their panel or `profile-` classes. Do not append unrelated fixes to the entry point.

Import order is intentional. This extraction preserves the existing rule order,
including responsive overrides and older shared selectors. Reordering rules,
merging separated duplicates, adding cascade layers, or changing selector scope
requires separate layout verification; those operations can change specificity
or which declaration wins. Edit the existing owning rule where possible instead
of adding another override at the end.

Third-party MapLibre and Cesium styles/assets are generated or package-owned;
change application styles here instead of editing those files.
