"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation unloads the previous WebGL renderer and avoids prefetching the other engine. */

import { useCallback, useEffect, useRef, useState } from "react";
import { BoundedCache, cachedJson, coordinateQuery } from "../lib/viewer/cache";
import { recordMetric } from "../lib/viewer/metrics";
import { SURFACES, SURFACE_DETAILS, TEST_PLACES, type Surface } from "../lib/viewer/sources";
import type { createScene } from "../lib/viewer/cesium-runtime";

type Geology = { units: { name?:string; strat_name?:string; lith?:string; best_int_name?:string; descrip?:string }[]; refs:Record<string,string> };
type Soil = { soil:null|{mapUnitName:string;componentName:string|null;componentPercent:number|null;texture:string|null;drainageClass:string|null;ph:number|null;slopePercent:number|null;horizons:{name:string|null;topCm:number|null;bottomCm:number|null;texture:string|null}[]} };
type Provenance = {elevation?:{status:string;result?:{elevation:number|null;resolution:number|null;resolutionUnits:string|null;verticalDatum:string|null}|null}};
type Evidence<T> = {status:"loading"|"ready"|"error";data?:T};

export default function EnhancedViewer() {
  const container=useRef<HTMLDivElement>(null);
  const scene=useRef<ReturnType<typeof createScene>|null>(null);
  const cache=useRef(new BoundedCache<unknown>(48));
  const request=useRef<AbortController|null>(null);
  const searchRequest=useRef<AbortController|null>(null);
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  const [status,setStatus]=useState("Loading 3D viewer…"),[terrain,setTerrain]=useState("Loading global elevation…");
  const [surface,setSurface]=useState<Surface>("Natural"),[labels,setLabels]=useState(true);
  const [point,setPoint]=useState<{longitude:number;latitude:number;elevation:number}|null>(null);
  const [center,setCenter]=useState([-112.112,36.106]);
  const [geology,setGeology]=useState<Evidence<Geology>|null>(null),[soil,setSoil]=useState<Evidence<Soil>|null>(null),[provenance,setProvenance]=useState<Evidence<Provenance>|null>(null);
  const [query,setQuery]=useState(""),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [places,setPlaces]=useState<{name:string;point:[number,number]}[]>([]);
  const inspect=useCallback((longitude:number,latitude:number,elevation:number)=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    const started=performance.now();setPoint({longitude,latitude,elevation});
    setGeology({status:"loading"});setSoil({status:"loading"});setProvenance({status:"loading"});
    const lookup=<T,>(domain:string,update:(value:Evidence<T>)=>void)=>cachedJson<T>(cache.current,`/api/${domain}?${coordinateQuery(longitude,latitude)}${domain==="provenance"?"&scope=elevation":""}`,controller.signal)
      .then(data=>{if(!controller.signal.aborted){update({status:"ready",data});recordMetric(`inspect-${domain}`,started);}})
      .catch(()=>{if(!controller.signal.aborted)update({status:"error"});});
    void Promise.allSettled([lookup("geology",setGeology),lookup("soil",setSoil),lookup("provenance",setProvenance)]);
  },[]);
  useEffect(()=>{
    let disposed=false;
    // Static workers/assets are local and copied during both dev and production builds.
    (window as Window & {CESIUM_BASE_URL?:string}).CESIUM_BASE_URL="/cesium/";
    const css=document.createElement("link");css.rel="stylesheet";css.href="/cesium/Widgets/widgets.css";document.head.appendChild(css);
    import("../lib/viewer/cesium-runtime").then(({createScene})=>{
      if(disposed||!container.current)return;
      scene.current=createScene(container.current,{status:setStatus,active:setSurface,terrain:setTerrain,pick:inspect,center:(lng,lat)=>setCenter([lng,lat])});setReady(true);
    }).catch(()=>{if(!disposed)setError("Enhanced 3D could not start on this device. The standard viewer is still available.");});
    return()=>{disposed=true;request.current?.abort();searchRequest.current?.abort();scene.current?.destroy();scene.current=null;css.remove();};
  },[inspect]);
  async function search(){
    searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;
    setSearchError("");setPlaces([]);
    const coordinates=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if(coordinates){const latitude=Number(coordinates[1]),longitude=Number(coordinates[2]);if(Math.abs(latitude)>90||Math.abs(longitude)>180){setSearchError("Use latitude −90 to 90 and longitude −180 to 180.");return;}scene.current?.fly(longitude,latitude,14000);return;}
    if(query.trim().length<2)return;
    setSearching(true);
    try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});if(!response.ok)throw new Error();const data=await response.json();if(!controller.signal.aborted){setPlaces(Array.isArray(data)?data:[]);if(!Array.isArray(data)||!data.length)setSearchError("No matching places found.");}}
    catch{if(!controller.signal.aborted)setSearchError("Place search unavailable. Try latitude, longitude.");}
    finally{if(!controller.signal.aborted)setSearching(false);}
  }
  const soilData=soil?.data?.soil;
  const firstRock=geology?.data?.units?.[0];
  return <main className="enhanced-viewer">
    <header><a className="brand" href="/">◈ GEO GRAPH<small>Terrain intelligence</small></a><span className="header-note">Enhanced 3D · trial</span><a className="viewer-trial-link" href="/">Standard viewer</a></header>
    <div className="workspace"><aside>
      <section className="intro"><p className="eyebrow">EXPLORE THE SURFACE</p><h1>See the landscape.<br/>Understand the ground.</h1><p>Progressive terrain detail. Click the ground for mapped evidence. Existing survey and area tools remain in the standard viewer.</p></section>
      <section><label htmlFor="enhanced-search">Find a place</label><form className="search-row" onSubmit={event=>{event.preventDefault();void search();}}><input id="enhanced-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Place or latitude, longitude"/><button disabled={!ready||searching}>{searching?"Searching…":"Go"}</button></form>{searchError&&<p role="status">{searchError}</p>}{places.map((place,index)=><button className="trial-place" key={index} onClick={()=>{scene.current?.fly(place.point[0],place.point[1],9000);setPlaces([]);}}>{place.name}</button>)}</section>
      <section><p className="eyebrow">SURFACE LAYERS</p><div className="trial-surfaces">{SURFACES.map(name=><button key={name} disabled={!ready} aria-pressed={surface===name} onClick={()=>{void scene.current?.surface(name);}}>{name}</button>)}</div><p className="display-note">{SURFACE_DETAILS[surface]}</p><label className="trial-checkbox"><input type="checkbox" checked={labels} onChange={event=>{setLabels(event.target.checked);scene.current?.labels(event.target.checked);}}/> Place names and boundaries</label></section>
      <section><p className="eyebrow">CITY & REMOTE COMPARISONS</p><div className="trial-surfaces">{TEST_PLACES.map(place=><button key={place.name} disabled={!ready} onClick={()=>scene.current?.fly(place.longitude,place.latitude,place.height)}>{place.name}</button>)}</div></section>
      <section className="inspector"><p className="eyebrow">SELECTED GROUND</p>{!point?<p>Click terrain to inspect elevation, mapped rocks, and soil. Each source loads independently.</p>:<>
        <h2>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</h2><p>Rendered terrain height: {Math.round(point.elevation).toLocaleString()} m · ellipsoidal reference. Not a survey measurement.</p>
        <h3>Surface geology</h3>{geology?.status==="loading"?<p>Reading geological map…</p>:geology?.status==="error"?<p>Geology service unavailable.</p>:firstRock?<><strong>{firstRock.name||firstRock.strat_name||"Mapped unit"}</strong><p>{firstRock.lith} · {firstRock.best_int_name}</p><p>{firstRock.descrip}</p><small>{geology?.data?.units.length} overlapping map unit(s). Surface mapping does not establish underground layers.</small></>:<p>No geological record returned here.</p>}
        <p><a href="https://macrostrat.org/" target="_blank" rel="noreferrer">Macrostrat and original survey authors ↗</a></p>
        <h3>Soil survey</h3>{soil?.status==="loading"?<p>Reading USDA survey…</p>:soil?.status==="error"?<p>Soil service unavailable.</p>:soilData?<><strong>{soilData.mapUnitName}</strong><p>{soilData.componentName} · {soilData.componentPercent??"Unknown"}% of map unit</p><dl className="trial-facts"><dt>Texture</dt><dd>{soilData.texture??"Not recorded"}</dd><dt>Drainage</dt><dd>{soilData.drainageClass??"Not recorded"}</dd><dt>pH</dt><dd>{soilData.ph??"Not recorded"}</dd><dt>Mapped slope</dt><dd>{soilData.slopePercent==null?"Not recorded":`${soilData.slopePercent}%`}</dd></dl>{soilData.horizons?.slice(0,6).map((h,index)=><p key={index}>{h.name??"Horizon"}: {h.topCm??"?"}–{h.bottomCm??"?"} cm · {h.texture??"Texture unavailable"}</p>)}</>:<p>No SSURGO soil record returned. U.S. coverage varies.</p>}
        <p><a href="https://websoilsurvey.nrcs.usda.gov/" target="_blank" rel="noreferrer">USDA NRCS soil survey ↗</a></p>
        <h3>Independent elevation reference</h3>{provenance?.status==="loading"?<p>Checking USGS elevation…</p>:provenance?.data?.elevation?.result?<p>USGS: {provenance.data.elevation.result.elevation??"Unknown"} m. Source spacing: {provenance.data.elevation.result.resolution??"Unknown"} {provenance.data.elevation.result.resolutionUnits??""}. Vertical datum: {provenance.data.elevation.result.verticalDatum??"not supplied"}. Do not directly compare heights with different reference datums.</p>:<p>USGS reference unavailable for this point.</p>}
      </>}</section>
      <section className="coverage"><p>{terrain}</p><p>Detail loads for the visible area. Historical imagery and mapped evidence are not live ground measurements.</p></section>
    </aside><div className="map-shell"><div ref={container} className="map" aria-label="Enhanced 3D terrain viewer"/>{status&&<div className="layer-status" role="status">{status}</div>}{error&&<div className="map-message" role="alert">{error}<a href="/">Open standard viewer</a></div>}<div className="mode-chip"><span>ENHANCED 3D</span><strong>{surface}</strong><small>{center[1].toFixed(3)}, {center[0].toFixed(3)}</small></div><div className="camera-tools"><button disabled={!ready} onClick={()=>scene.current?.scale(15000000)}>World</button><button disabled={!ready} onClick={()=>scene.current?.scale(250000)}>Region</button><button disabled={!ready} onClick={()=>scene.current?.scale(14000)}>Ground</button>{point&&<button onClick={()=>scene.current?.fly(point.longitude,point.latitude,6000)}>Selection</button>}</div><div className="map-help">Drag to pan · Wheel to zoom · Ctrl + drag to orbit · Click ground to inspect</div></div></div>
  </main>;
}
