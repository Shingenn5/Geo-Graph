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
  assert.equal(await page.getByRole("button",{name:/Buildings|Construction/}).count(),0);
  assert.equal(await page.getByRole("checkbox",{name:/Overture/}).count(),0);
  await page.getByRole("button",{name:"Drilling",exact:true}).click();
  await page.locator("#las-file").setInputFiles({name:"test-well.las",mimeType:"text/plain",buffer:Buffer.from(`~Version\nVERS. 2.0\n~Well\nNULL. -999.25\n~Curve\nDEPT.M : Depth\nGR.API : Gamma ray\nRHOB.G/C3 : Density\nRT.OHMM : Resistivity\n~ASCII\n1000 42 2.4 18\n1001 -999.25 2.5 19\n1002 70 2.6 20`)});
  await page.locator(".well-log-viewer").waitFor();
  assert.equal(await page.locator(".log-track svg").count(),3);
  assert.match(await page.locator(".log-quality").innerText(),/MD \/ TVD UNKNOWN/);
  await page.waitForFunction(()=>{const canvas=document.querySelector(".map canvas"),map=document.querySelector(".map");return canvas&&map&&Math.abs(canvas.getBoundingClientRect().width-map.clientWidth)<2;});
  await mkdir("outputs/viewer-qa",{recursive:true});await page.screenshot({path:"outputs/viewer-qa/drilling-workspace.png"});
  results.push({buildingsRemoved:true,drillingTracks:true,mapFitsDock:true});
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

