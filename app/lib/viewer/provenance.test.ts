import { test } from "node:test";
import { strict as assert } from "node:assert";
import { GET } from "../../api/provenance/route.ts";

test("elevation-only reference does not wait for or request the imagery catalog",async()=>{
  const original=globalThis.fetch;const urls:string[]=[];
  globalThis.fetch=async input=>{urls.push(String(input));return Response.json({value:1550,resolution:1});};
  try {
    const response=await GET(new Request("https://geo.test/api/provenance?lng=-110&lat=40&scope=elevation"));
    const result=await response.json() as {elevation:{result:{elevation:number;verticalDatum:null}}};
    assert.equal(urls.length,1);assert.match(urls[0],/epqs/);
    assert.equal(result.elevation.result.elevation,1550);assert.equal(result.elevation.result.verticalDatum,null);
  }finally{globalThis.fetch=original;}
});
