import {strict as assert} from "node:assert";
import {test} from "node:test";
import {profilePlan,summarizeProfile,sampleGrade,profileCsv,type ProfileSample} from "./terrain-profile.ts";

const sample=(distance:number,elevation:number|null):ProfileSample=>({distance,elevation,longitude:-112,latitude:36});
test("profile requests have a fixed budget and reject invalid spans",()=>{
  for(const distance of [20,500,10_000,200_000]){const plan=profilePlan(distance);assert.equal(plan.count,129);assert.ok(plan.level>=8&&plan.level<=14);}
  for(const distance of [NaN,Infinity,0,19,200_001])assert.throws(()=>profilePlan(distance));
});
test("negative and flat heights are valid; rise and fall use consecutive samples",()=>{
  const profile=summarizeProfile([sample(0,-20),sample(100,0),sample(200,0),sample(300,-10)],12);
  assert.equal(profile.min,-20);assert.equal(profile.max,0);assert.equal(profile.ascent,20);assert.equal(profile.descent,10);
  assert.equal(sampleGrade(profile.samples,1),20);assert.equal(sampleGrade(profile.samples,0),null);
});
test("missing coverage cannot invent slopes or bridge ascent totals",()=>{
  const profile=summarizeProfile([sample(0,10),sample(100,null),sample(200,200),sample(300,210)],10);
  assert.equal(profile.validCount,3);assert.equal(profile.ascent,10);assert.equal(sampleGrade(profile.samples,2),null);
  assert.throws(()=>summarizeProfile([sample(0,null),sample(100,null)],10));
});
test("CSV preserves missing heights and includes the source and datum",()=>{
  const profile=summarizeProfile([sample(0,-10),sample(100,null),sample(200,30)],12,"2026-09-25T00:00:00.000Z");
  const rows=profileCsv(profile).split("\r\n");
  assert.equal(rows.length,4);assert.equal(rows[2].split(",")[3],"");assert.equal(rows[2].split(",")[4],"");
  assert.match(rows[1],/WGS84 ellipsoidal height/);assert.match(rows[1],/https:\/\/terrain.reearth.land/);
});
