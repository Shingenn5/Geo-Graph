import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdir,writeFile } from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:"playwright");
const base=process.argv[2]??"http://127.0.0.1:8787";
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const results=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>window.geoGraphMetrics?.samples.some(s=>s.name==="maplibre-initial-ready"));
  for(const name of ["Geology","Soil","Natural"]){
    const count=await page.evaluate(()=>window.geoGraphMetrics.samples.length);
    await page.getByRole("button",{name:new RegExp(name+"$")}).click();
    await page.waitForFunction(count=>window.geoGraphMetrics.samples.length>count,count,{timeout:15000});
    assert.equal(await page.locator(".layer-status").count(),0,`Layer failed: ${name}`);
  }
  // Delay one source, then supersede it. The abandoned load must not win.
  await page.route("**/api/tiles/**",async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue().catch(()=>{});});
  for(const name of ["Geology","Soil","Natural"]){await page.getByRole("button",{name:new RegExp(name+"$")}).click();}
  await page.waitForTimeout(1300);
  assert.match(await page.locator(".mode-chip").innerText(),/NATURAL/);
  await page.unroute("**/api/tiles/**");
  results.push({standardLayers:true,rapidSwitch:true});
  await page.getByPlaceholder("City, landmark, or coordinates").fill("40.7484, -73.9857");await page.getByRole("button",{name:"Go",exact:true}).click();
  await page.waitForTimeout(1200);for(let i=0;i<3;i++){await page.getByRole("button",{name:"Zoom in",exact:true}).click();await page.waitForTimeout(300);}
  const rangeResponse=page.waitForResponse(response=>response.url().includes("buildings.pmtiles")&&response.status()===206,{timeout:15000});
  await page.getByRole("checkbox",{name:/Overture building detail/}).check();
  await rangeResponse;
  await page.waitForTimeout(1000);
  await mkdir("outputs/viewer-qa",{recursive:true});await page.screenshot({path:"outputs/viewer-qa/overture-new-york.png"});
  results.push({overtureRangeRequests:true});
  await page.goto(`${base}/viewer`);await page.waitForFunction(()=>window.geoGraphMetrics?.samples.some(s=>s.name==="cesium-initial-ready"));
  // Failure keeps the active natural layer instead of presenting an empty geology layer.
  await page.route("**/api/tiles/**",route=>route.fulfill({status:503,body:"Test source outage"}));
  await page.getByRole("button",{name:"Geology",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector(".layer-status")?.textContent.includes("Previous view retained"),{},{timeout:18000});
  assert.equal(await page.locator('.trial-surfaces button[aria-pressed="true"]').innerText(),"Natural");
  results.push({cesiumSourceFailureRetainsPrevious:true});
  await page.unroute("**/api/tiles/**");
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Mobile horizontal overflow");
  await page.screenshot({path:"outputs/viewer-qa/mobile.png",fullPage:true});
  assert.deepEqual(errors,[]);results.push({mobileFits:true,pageErrors:errors});
  console.log(JSON.stringify(results));
} finally {await mkdir("outputs/viewer-qa",{recursive:true});await writeFile("outputs/viewer-qa/interactions.json",JSON.stringify(results,null,2));await browser.close();}

