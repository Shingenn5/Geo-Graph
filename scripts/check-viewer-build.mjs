import { readFileSync, existsSync, statSync } from "node:fs";
import assert from "node:assert/strict";
const manifest=JSON.parse(readFileSync("dist/client/.vite/manifest.json","utf8"));
const visit=(key,seen=new Set())=>{if(seen.has(key))return seen;seen.add(key);for(const dependency of manifest[key]?.imports??[])visit(dependency,seen);return seen;};
const standard=visit("app/components/GeoExplorer.tsx");
assert(![...standard].some(key=>key.includes("cesium")),"Standard viewer must not statically import Cesium");
const runtime=manifest["app/lib/viewer/cesium-runtime.ts"];
assert(runtime?.isDynamicEntry,"Cesium must remain a lazy entry");
for(const file of ["Assets/approximateTerrainHeights.json","Widgets/widgets.css"]){assert(existsSync(`dist/client/cesium/${file}`),`Missing Cesium asset ${file}`);}
assert(existsSync("dist/client/cesium/Workers"),"Missing Cesium workers");
console.log(JSON.stringify({standardStaticBytes:[...standard].reduce((total,key)=>total+(manifest[key]?.file?statSync(`dist/client/${manifest[key].file}`).size:0),0),cesiumLazyBytes:statSync(`dist/client/${runtime.file}`).size,cesiumOnStandardRoute:false,assetsPresent:true}));
