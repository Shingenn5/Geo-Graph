import type {
  EvidenceDomain, EvidenceValue, Provenance, SurveySelection, SurveySelectionInput,
} from "./types";

const SOIL_SOURCE = "USDA NRCS Soil Data Access / SSURGO";
const GEOLOGY_SOURCE = "Macrostrat / published geologic map sources";

function checkedCoordinates(input: SurveySelectionInput["coordinates"]) {
  const { longitude, latitude } = input;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("Survey coordinates must be finite WGS84 longitude/latitude values.");
  }
  return { longitude, latitude };
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function addRecordFields(
  output: EvidenceValue[], domain: EvidenceDomain, data: Record<string, unknown>, source: string,
  retrievedAt?: string, href?: string,
) {
  const provenance: Provenance = { kind: "observed", source, ...(href ? { href } : {}), ...(retrievedAt ? { retrievedAt } : {}) };
  for (const [label, value] of Object.entries(data)) {
    if (label === "horizons" || value === undefined) continue;
    output.push({
      domain, label, value: value ?? null,
      status: isPresent(value) ? "available" : "unavailable", provenance,
      ...(!isPresent(value) ? { note: "No value was published by the source." } : {}),
    });
  }
}

/** Normalize the app's current soil/geology responses and optional well records. */
export function createSurveySelection(input: SurveySelectionInput): SurveySelection {
  const coordinates = checkedCoordinates(input.coordinates);
  const evidence: EvidenceValue[] = [];
  const sources: Provenance[] = [];
  const selectedAt = input.selectedAt && Number.isFinite(Date.parse(input.selectedAt))
    ? new Date(input.selectedAt).toISOString() : new Date().toISOString();

  const soilStatus = input.soil?.status ?? "not-queried";
  const soilSource = input.soil?.source ?? SOIL_SOURCE;
  const soilProvenance: Provenance = { kind: "observed", source: soilSource, ...(input.soil?.retrievedAt ? { retrievedAt: input.soil.retrievedAt } : {}) };
  sources.push(soilProvenance);
  if (input.soil?.data) {
    addRecordFields(evidence, "soil", input.soil.data as Record<string, unknown>, soilSource, input.soil.retrievedAt);
    for (const [index, horizon] of (input.soil.data.horizons ?? []).entries()) {
      const evidenceStart = evidence.length;
      addRecordFields(evidence, "soil", horizon as Record<string, unknown>, soilSource, input.soil.retrievedAt);
      // Include a stable, explicit path while retaining a simple label for renderers.
      for (const item of evidence.slice(evidenceStart)) item.label = `Horizon ${index + 1} · ${item.label}`;
    }
  } else {
    const status = soilStatus === "available" ? "no-record" : soilStatus;
    evidence.push({ domain: "soil", label: "Soil lookup", value: null, status, provenance: soilProvenance,
      note: status === "unavailable" ? "The soil service did not return evidence." : status === "not-queried" ? "Soil lookup has not been run." : "No mapped soil record covers this point." });
  }

  const geologyStatus = input.geology?.status ?? "not-queried";
  const geologySource = input.geology?.source ?? GEOLOGY_SOURCE;
  const geologyProvenance: Provenance = { kind: "observed", source: geologySource, ...(input.geology?.retrievedAt ? { retrievedAt: input.geology.retrievedAt } : {}) };
  sources.push(geologyProvenance);
  const units = input.geology?.units ?? [];
  if (geologyStatus !== "available" || units.length === 0) {
    const status = geologyStatus === "available" ? "no-record" : geologyStatus;
    evidence.push({ domain: "geology", label: "Geology lookup", value: null, status,
      provenance: geologyProvenance, note: status === "unavailable" ? "The geology service did not return evidence." : status === "not-queried" ? "Geology lookup has not been run." : "No mapped rock unit was returned at this point." });
  }
  units.forEach(unit => {
    addRecordFields(evidence, "geology", unit as Record<string, unknown>, geologySource, input.geology?.retrievedAt);
    const reference = unit.source_id == null ? null : input.geology?.refs?.[String(unit.source_id)];
    if (reference) evidence.push({
      domain: "geology", label: "Original survey reference", value: reference, status: "available",
      provenance: geologyProvenance,
    });
  });

  const wellsStatus = input.wells?.status ?? "not-queried";
  const wellsSource = input.wells?.source ?? "No well-data source configured";
  const wellProvenance: Provenance = { kind: "observed", source: wellsSource, ...(input.wells?.retrievedAt ? { retrievedAt: input.wells.retrievedAt } : {}) };
  sources.push(wellProvenance);
  const wells = input.wells?.records ?? [];
  if (!wells.length) {
    const status = wellsStatus === "available" ? "no-record" : wellsStatus;
    evidence.push({ domain: "well", label: "Well records", value: null, status,
      provenance: wellProvenance, note: status === "not-queried" ? "No well lookup is configured or has been run." : status === "unavailable" ? "The well-data service did not return evidence." : "No well records were supplied for this point." });
  }
  wells.forEach(well => {
    const source = well.source || wellsSource;
    const provenance: Provenance = { kind: "observed", source, ...(well.sourceUrl ? { href: well.sourceUrl } : {}), ...(well.observedAt ? { retrievedAt: well.observedAt } : {}) };
    sources.push(provenance);
    addRecordFields(evidence, "well", { ...well, attributes: well.attributes ? JSON.stringify(well.attributes) : undefined }, source, well.observedAt ?? undefined, well.sourceUrl);
  });

  for (const item of input.context ?? []) {
    const provenance: Provenance = { kind: item.kind ?? "illustrative", source: item.source, ...(item.method ? { method: item.method } : {}) };
    sources.push(provenance);
    evidence.push({ domain: "context", label: item.label, value: item.value, status: isPresent(item.value) ? "available" : "unavailable", provenance,
      ...(!isPresent(item.value) ? { note: "No value was supplied." } : {}) });
  }

  return { schema: "geo-graph-survey/v1", coordinates, coordinateReferenceSystem: "OGC:CRS84", selectedAt, evidence, sources };
}

/** Evidence-inclusive RFC 7946 point collection, suitable for .geojson download. */
export function buildSurveyGeoJSON(selection: SurveySelection) {
  return {
    type: "FeatureCollection" as const,
    name: "Geo Graph point survey",
    description: "Published map evidence and its provenance for one selected WGS84 point.",
    features: [{
      type: "Feature" as const,
      id: "selected-point",
      geometry: { type: "Point" as const, coordinates: [selection.coordinates.longitude, selection.coordinates.latitude] as [number, number] },
      properties: {
        schema: selection.schema,
        coordinateReferenceSystem: selection.coordinateReferenceSystem,
        selectedAt: selection.selectedAt,
        evidence: selection.evidence,
        sources: selection.sources,
      },
    }],
  };
}

/** JSON string for a regular .json export; nulls remain explicit. */
export function serializeSurveyJSON(selection: SurveySelection, pretty = true): string {
  return JSON.stringify(selection, null, pretty ? 2 : undefined);
}

/** RFC 7946 GeoJSON string for a regular .geojson export. */
export function serializeSurveyGeoJSON(selection: SurveySelection, pretty = true): string {
  return JSON.stringify(buildSurveyGeoJSON(selection), null, pretty ? 2 : undefined);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function displayValue(item: EvidenceValue): string {
  if (item.status === "not-queried") return "Not queried";
  if (item.status === "no-record") return "No record found";
  if (item.status === "unavailable" || item.value == null || item.value === "") return "Unavailable";
  if (typeof item.value === "object") return JSON.stringify(item.value);
  return String(item.value);
}

/** Self-contained, printable report HTML. All interpolated content is escaped. */
export function buildSurveyReportHtml(selection: SurveySelection, title = "Geo Graph Point Survey"): string {
  const rows = selection.evidence.map(item => `<tr><td>${escapeHtml(item.domain)}</td><th scope="row">${escapeHtml(item.label)}</th><td>${escapeHtml(displayValue(item))}</td><td>${escapeHtml(item.provenance.kind)}</td><td>${escapeHtml(item.provenance.source)}${item.provenance.method ? `<br>${escapeHtml(item.provenance.method)}` : ""}${item.note ? `<br><span class="muted">${escapeHtml(item.note)}</span>` : ""}</td></tr>`).join("");
  const sourceRows = selection.sources.map(source => `<li><strong>${escapeHtml(source.kind)}</strong> — ${escapeHtml(source.source)}${source.href ? ` (${escapeHtml(source.href)})` : ""}${source.retrievedAt ? ` · Retrieved ${escapeHtml(source.retrievedAt)}` : ""}</li>`).join("");
  const { longitude, latitude } = selection.coordinates;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:15px system-ui,sans-serif;color:#18323b;max-width:1100px;margin:36px auto;padding:0 24px}h1{margin-bottom:4px}h2{margin-top:30px;color:#176d78}.muted,.meta{color:#61757d}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #dce5e7;overflow-wrap:anywhere}thead{background:#edf4f3}thead th{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.notice{background:#f5f1e7;border-left:4px solid #b38b40;padding:12px}.print{padding:9px 14px;border:0;border-radius:6px;background:#176d78;color:#fff}@media print{body{margin:0;max-width:none}.print{display:none}}</style></head><body><header><h1>${escapeHtml(title)}</h1><p class="meta">WGS84 coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} · Selected ${escapeHtml(selection.selectedAt)}</p><button class="print" onclick="window.print()">Print / Save as PDF</button></header><p class="notice">Map-derived evidence describes published records near this point. It is not a field measurement, site investigation, or professional determination. Missing values are shown explicitly.</p><h2>Evidence</h2><table><thead><tr><th>Domain</th><th>Record / field</th><th>Value</th><th>Evidence class</th><th>Provenance / note</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No evidence records were supplied.</td></tr>'}</tbody></table><h2>Sources</h2><ul>${sourceRows || "<li>No sources supplied.</li>"}</ul><footer class="meta">Export schema: ${escapeHtml(selection.schema)} · Coordinate order in GeoJSON: longitude, latitude.</footer></body></html>`;
}
