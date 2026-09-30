import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createSurveySelection, buildSurveyReportHtml, serializeSurveyJSON } from "../app/lib/survey/selection.ts";

const base = process.argv[2] ?? "http://127.0.0.1:8789";
const pilot = "lat=40.31459&lng=-109.99532";
const snapshots = new Map();
const checks = [
  ["health", "/api/health", data => assert.equal(data.application, "geo-graph")],
  ["pilot soil", `/api/soil?${pilot}`, data => assert.ok(data.soil?.mapUnitKey)],
  ["pilot geology", `/api/geology?${pilot}`, data => assert.ok(data.units?.length)],
  ["public wells", `/api/wells?${pilot}&radiusKm=15&limit=12`, data => assert.ok(data.wells?.length)],
  ["source provenance", `/api/provenance?${pilot}`, data => assert.ok(data.elevation && data.imagery)],
  ["place search", "/api/search?q=Grand%20Canyon", data => assert.ok(Array.isArray(data) && data.length)],
  ["no soil coverage", "/api/soil?lat=0&lng=0", data => assert.equal(data.soil, null)],
];
const results = await Promise.all(checks.map(async ([name, route, validate]) => {
  const started = performance.now();
  try {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, `${name}: HTTP ${response.status}`);
    const data = await response.json();
    validate(data);
    snapshots.set(name, data);
    return { name, passed: true, milliseconds: Math.round(performance.now() - started) };
  } catch (error) { return { name, passed: false, error: error.message }; }
}));
try {
  const response = await fetch(`${base}/api/tiles/14/3185/6183`, {signal:AbortSignal.timeout(20_000)});
  assert.equal(response.status,200);
  assert.match(response.headers.get("content-type") ?? "",/image\/png/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
  results.push({name:"pilot geology imagery",passed:true});
} catch(error) { results.push({name:"pilot geology imagery",passed:false,error:error.message}); }
for (const [name, route] of [
  ["invalid soil coordinates", "/api/soil?lat=91&lng=0"],
  ["invalid geology tile", "/api/tiles/20/0/0"],
  ["invalid well radius", `/api/wells?${pilot}&radiusKm=999`],
]) {
  try {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 400);
    results.push({ name, passed: true });
  } catch (error) { results.push({ name, passed: false, error: error.message }); }
}
await mkdir("outputs/demo-readiness", { recursive: true });
await writeFile("outputs/demo-readiness/api-checks.json", JSON.stringify({ checkedAt: new Date().toISOString(), base, results }, null, 2));
if (["pilot soil","pilot geology","public wells","source provenance"].every(name => snapshots.has(name))) {
  const soil=snapshots.get("pilot soil"),geology=snapshots.get("pilot geology"),wells=snapshots.get("public wells"),provenance=snapshots.get("source provenance");
  const retrievedAt=new Date().toISOString();
  const selection=createSurveySelection({
    coordinates:{longitude:-109.99532,latitude:40.31459},selectedAt:retrievedAt,
    soil:{status:"available",data:soil.soil,retrievedAt},
    geology:{status:"available",units:geology.units,refs:geology.refs,retrievedAt},
    wells:{status:"available",source:wells.source.attribution,retrievedAt,records:wells.wells.map(well => ({...well,source:wells.source.attribution,sourceUrl:wells.source.datasetUrl,observedAt:retrievedAt}))},
    context:[{label:"Independent USGS elevation (metres)",value:provenance.elevation.result?.elevation ?? null,source:"USGS EPQS",kind:"derived",method:"Snapshot from the live preflight. Vertical datum may differ from the displayed terrain."}],
  });
  await writeFile("outputs/demo-readiness/pilot-survey.html",buildSurveyReportHtml(selection));
  await writeFile("outputs/demo-readiness/pilot-survey.json",serializeSurveyJSON(selection));
  await writeFile("outputs/demo-readiness/pilot-source-responses.json",JSON.stringify({retrievedAt,soil,geology,wells,provenance},null,2));
  console.log("Saved local pilot backup: outputs/demo-readiness/pilot-survey.html");
}
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
if (results.some(result => !result.passed)) process.exitCode = 1;
