import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {mkdir,readFile,writeFile} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:"playwright");
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
const results=[];
await mkdir("outputs/profile-qa",{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];let evidenceRequests=0;
  page.on("pageerror",error=>errors.push(error.message));
  page.on("request",request=>{if(/\/api\/(soil|geology|provenance)/.test(request.url()))evidenceRequests++;});
  await page.goto(`${process.argv[2]??"http://127.0.0.1:8787"}/viewer`);
  const launch=page.getByRole("button",{name:"Terrain profile",exact:true});
  await launch.waitFor();await page.waitForFunction(()=>!document.querySelector('.camera-tools button')?.disabled);
  await page.waitForFunction(()=>document.querySelector('.coverage')?.textContent.includes('Re:Earth / Mapterhorn terrain'),{},{timeout:30000});
  await page.waitForTimeout(2500);
  const panel=page.getByRole("region",{name:"Terrain profile"});
  async function draw(){
    await launch.click();
    const box=await page.locator('.cesium-widget canvas').first().boundingBox();
    await page.mouse.click(box.x+box.width*.36,box.y+box.height*.38);
    await page.getByText('Click the ground to set point B.',{exact:false}).waitFor();
    await page.mouse.click(box.x+box.width*.65,box.y+box.height*.48);
  }
  for(const place of ['Grand Canyon','Australian Outback']){
    await page.getByRole('button',{name:place,exact:true}).click();await page.waitForTimeout(2200);
    await draw();
    await panel.getByRole('button',{name:'Export CSV'}).waitFor({timeout:25000});
    const slider=panel.getByRole('slider',{name:'Profile position'});
    await slider.focus();await page.keyboard.press('End');
    assert.equal(await slider.inputValue(),'128');
    const downloadEvent=page.waitForEvent('download');await panel.getByRole('button',{name:'Export CSV'}).click();
    const download=await downloadEvent;const csv=await readFile(await download.path(),'utf8');
    assert.equal(csv.split('\r\n').length,130);assert.match(csv,/WGS84 ellipsoidal height/);
    await page.screenshot({path:`outputs/profile-qa/${place.replaceAll(' ','-')}.png`});
    results.push({place,chart:true,csvSamples:129,keyboardScrub:true});
    if(place==='Grand Canyon'){
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'outputs/profile-qa/mobile.png',fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    }
    await panel.getByRole('button',{name:'Clear profile'}).click();
  }
  assert.equal(evidenceRequests,0,'Drawing a profile must not trigger geology/soil inspection');
  await launch.click();await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  // Cancel while terrain is in flight: a late response must never restore the cleared chart.
  const terrainPattern=/terrain\.reearth\.land\/cesium-mesh\/ellipsoid\/.*\.terrain/;
  let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const delayTerrain=async route=>{await delayed;await route.continue().catch(()=>{});};
  await page.route(terrainPattern,delayTerrain);
  await draw();await panel.getByText('Sampling terrain along your line…',{exact:false}).waitFor();
  await panel.getByRole('button',{name:'Cancel',exact:true}).click();release();
  await page.waitForTimeout(2200);assert.equal(await panel.count(),0);
  await page.unroute(terrainPattern,delayTerrain);
  // A failed elevation service must show unavailable data, never an invented zero-height profile.
  await page.route(/terrain\.reearth\.land\/cesium-mesh\/ellipsoid\/.*\.terrain/,route=>route.fulfill({status:503,body:'Test terrain outage'}));
  await draw();await panel.getByRole('alert').waitFor({timeout:25000});
  assert.match(await panel.getByRole('alert').innerText(),/heights are unavailable|sampling timed out/);
  assert.equal(await panel.getByRole('button',{name:'Export CSV'}).count(),0);
  results.push({sourceFailure:true,escapeCancels:true,cancelledResultStaysCleared:true,evidenceRequests,errors});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(results));
}finally{
  await writeFile('outputs/profile-qa/results.json',JSON.stringify(results,null,2));await browser.close();
}
