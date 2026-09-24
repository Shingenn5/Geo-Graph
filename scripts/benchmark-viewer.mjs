// Run against local production servers. PLAYWRIGHT_MODULE may point to an existing installation.
// Example: node scripts/benchmark-viewer.mjs http://127.0.0.1:8788 http://127.0.0.1:8787
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const [baseline, candidate] = process.argv.slice(2);
if (!baseline || !candidate) throw new Error("Pass baseline and candidate production URLs.");
await mkdir("outputs/viewer-qa", { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL} : {}) });
const results = [];
try {
  for (const [name, url] of [["baseline",baseline],["candidate",candidate],["cesium",`${candidate}/viewer`]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.addInitScript(()=>{window.__qaLongTasks=[];try{new PerformanceObserver(list=>{for(const e of list.getEntries())window.__qaLongTasks.push(e.duration);}).observe({type:"longtask",buffered:true});}catch{}});
    const start=Date.now();await page.goto(url);
    if(name==="cesium")await page.waitForFunction(()=>window.geoGraphMetrics?.samples.some(s=>s.name==="cesium-initial-ready"),{},{timeout:30000});
    else await page.getByRole("button",{name:"World view, keep this location centered"}).waitFor();
    if(name!=="cesium")await page.waitForFunction(()=>!document.querySelector('button[aria-label="World view, keep this location centered"]')?.disabled,{},{timeout:30000});
    const readyMs=Date.now()-start;
    await page.screenshot({path:`outputs/viewer-qa/${name}-initial.png`});
    const metrics=await page.evaluate(()=>({navigation:performance.getEntriesByType("navigation").map(n=>({responseEnd:n.responseEnd,load:n.loadEventEnd})),jsBytes:performance.getEntriesByType("resource").filter(r=>r.name.includes("/_next/")&&r.name.endsWith(".js")).reduce((n,r)=>n+r.encodedBodySize,0),cesiumLoaded:performance.getEntriesByType("resource").some(r=>r.name.includes("cesium-runtime")),longTasks:window.__qaLongTasks,heap:performance.memory?.usedJSHeapSize}));
    await page.waitForTimeout(2500);
    const frames=await page.evaluate(async()=>{let last=performance.now();const intervals=[];const until=last+1800;document.querySelector('.camera-tools button:last-child')?.click();await new Promise(resolve=>{function tick(now){intervals.push(now-last);last=now;if(now<until)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick)});intervals.sort((a,b)=>a-b);return {median:intervals[Math.floor(intervals.length*.5)],p95:intervals[Math.floor(intervals.length*.95)],over33ms:intervals.filter(n=>n>33.4).length,total:intervals.length};});
    results.push({name,readyMs,metrics,frames,errors});console.log(JSON.stringify(results.at(-1)));
    if(name==="cesium") {
      for(const place of ["New York","Rural Nevada","Rural Wyoming","Uinta Basin"]) {
        await page.getByRole("button",{name:place,exact:true}).click();
        await page.waitForTimeout(2200);
        await page.screenshot({path:`outputs/viewer-qa/${place.replaceAll(" ","-")}.png`});
      }
      for(const layer of ["Geology","Soil","Land cover","USGS relief","Natural","Geology"]) {
        const before=await page.evaluate(()=>window.geoGraphMetrics?.samples.length??0);
        await page.getByRole("button",{name:layer,exact:true}).click();
        await page.waitForFunction(({before,layer})=>window.geoGraphMetrics?.samples.slice(before).some(s=>s.name===`cesium-layer-${layer}`)||/Previous view retained/.test(document.querySelector(".layer-status")?.textContent??""),{before,layer},{timeout:18000});
        const result=await page.evaluate(()=>({status:document.querySelector(".layer-status")?.textContent??"ready",metric:window.geoGraphMetrics?.samples.at(-1),active:document.querySelector('.trial-surfaces button[aria-pressed="true"]')?.textContent}));
        results.push({layer,...result});console.log(JSON.stringify(results.at(-1)));
        await page.screenshot({path:`outputs/viewer-qa/layer-${layer.replaceAll(" ","-")}.png`});
      }
      await page.locator("canvas").click({position:{x:400,y:400}});
      await page.waitForTimeout(1500);
      results.push({inspection:await page.locator(".inspector").innerText()});
    }
    await context.close();
  }
} finally {await writeFile("outputs/viewer-qa/results.json",JSON.stringify(results,null,2));await browser.close();}
