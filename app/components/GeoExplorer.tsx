"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as GLMap, MapGeoJSONFeature } from "maplibre-gl";

type Unit = { map_id:number; source_id:number; name:string; strat_name:string; lith:string; descrip:string; color:string; best_int_name:string; t_int_name:string; b_int_name:string };
type GeologyResult = { units:Unit[]; refs:Record<string,string> };
type Place = { name:string; point:[number,number] };
type Building = { name:string; height:string; levels:string; source:string };
type Soil = { mapUnitKey:string; mapUnitSymbol:string; mapUnitName:string; surveyAreaSymbol:string; surveyAreaName:string; componentName:string|null; componentPercent:number|null; taxonomicOrder:string|null; taxonomicSubgroup:string|null; drainageClass:string|null; hydrologicGroup:string|null; slopePercent:number|null; horizonName:string|null; horizonTopCm:number|null; horizonBottomCm:number|null; texture:string|null; sandPercent:number|null; siltPercent:number|null; clayPercent:number|null; organicMatterPercent:number|null; ph:number|null };
type SoilResult = { soil:Soil|null; source?:string };
type ViewMode = "GLOBE" | "TERRAIN" | "CITY";

const VIEWS = [
  { name:"Earth", icon:"◎", point:[-18,24] as [number,number], zoom:1.65, pitch:0, bearing:0 },
  { name:"Grand Canyon", icon:"△", point:[-112.112,36.106] as [number,number], zoom:11.8, pitch:56, bearing:-28 },
  { name:"San Francisco", icon:"▦", point:[-122.4011,37.7936] as [number,number], zoom:16.3, pitch:58, bearing:-25 },
];

function buildingFromFeature(feature:MapGeoJSONFeature):Building {
  const p=feature.properties??{};
  const rawHeight=Number(p.render_height??p.height), levels=Number(p.levels);
  const fallback=Number.isFinite(levels)?levels*3.2:6;
  return {name:String(p.name||p.class||"Building"),height:`${Math.round(Number.isFinite(rawHeight)?rawHeight:fallback)} m${Number.isFinite(rawHeight)?"":" estimated"}`,levels:Number.isFinite(levels)?String(levels):"Not mapped",source:"OpenStreetMap via OpenFreeMap"};
}

function escapeHtml(value:unknown){
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
}

export default function GeoExplorer(){
  const container=useRef<HTMLDivElement>(null), map=useRef<GLMap|null>(null), request=useRef<AbortController|null>(null), terrainRevealDone=useRef(false);
  const [ready,setReady]=useState(false),[mode,setMode]=useState<ViewMode>("GLOBE"),[zoom,setZoom]=useState(1.65),[base,setBase]=useState<"satellite"|"topo">("satellite"),[geology,setGeology]=useState(false),[faults,setFaults]=useState(false),[buildings,setBuildings]=useState(false),[hillshade,setHillshade]=useState(true);
  const [query,setQuery]=useState(""),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [point,setPoint]=useState<[number,number]|null>(null),[result,setResult]=useState<GeologyResult|null>(null),[selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[mapError,setMapError]=useState(""),[building,setBuilding]=useState<Building|null>(null),[sceneLoading,setSceneLoading]=useState(false);
  const [soil,setSoil]=useState<Soil|null>(null),[soilLoading,setSoilLoading]=useState(false),[soilError,setSoilError]=useState("");

  async function inspectGround(lng:number,lat:number,selectedBuilding:Building|null=null){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setPoint([lng,lat]);setBuilding(selectedBuilding);setLoading(true);setSoilLoading(true);setError("");setSoilError("");setResult(null);setSoil(null);setSelected(0);
    const selection=map.current?.getSource("selection") as GeoJSONSource|undefined;
    selection?.setData({type:"Feature",properties:{},geometry:{type:"Point",coordinates:[lng,lat]}});
    try{
      const [geologyRequest,soilRequest]=await Promise.allSettled([
        fetch(`/api/geology?lng=${lng}&lat=${lat}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<GeologyResult>;}),
        fetch(`/api/soil?lng=${lng}&lat=${lat}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<SoilResult>;})
      ]);
      if(controller.signal.aborted)return;
      if(geologyRequest.status==="fulfilled")setResult(geologyRequest.value);else setError("Geology lookup is unavailable. Try again shortly.");
      if(soilRequest.status==="fulfilled")setSoil(soilRequest.value.soil);else setSoilError("USDA soil survey lookup is unavailable. Try again shortly.");
    }finally{if(!controller.signal.aborted){setLoading(false);setSoilLoading(false);}}
  }

  function exportSoilReport(){
    if(!soil||!point)return;
    const value=(item:unknown,suffix="")=>item==null||item===""?"Not rated":`${escapeHtml(item)}${suffix}`;
    const rows=[
      ["Map unit",`${soil.mapUnitName} (${soil.mapUnitSymbol})`],["Map unit key",soil.mapUnitKey],["Survey area",`${soil.surveyAreaName} (${soil.surveyAreaSymbol})`],
      ["Major component",soil.componentName],["Component percentage",soil.componentPercent,"%"],["Taxonomic order",soil.taxonomicOrder],["Taxonomic subgroup",soil.taxonomicSubgroup],
      ["Drainage class",soil.drainageClass],["Hydrologic group",soil.hydrologicGroup],["Representative slope",soil.slopePercent,"%"],
      ["Surface horizon",soil.horizonName],["Horizon top",soil.horizonTopCm," cm"],["Horizon bottom",soil.horizonBottomCm," cm"],["Surface texture",soil.texture],
      ["Sand",soil.sandPercent,"%"],["Silt",soil.siltPercent,"%"],["Clay",soil.clayPercent,"%"],["Organic matter",soil.organicMatterPercent,"%"],["pH",soil.ph],
    ];
    const table=rows.map(([label,item,suffix])=>`<tr><th>${escapeHtml(label)}</th><td>${value(item,String(suffix??""))}</td></tr>`).join("");
    const generated=new Date().toLocaleString();
    const report=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Geo Graph Soil Survey Report</title><style>body{font:15px Arial,sans-serif;color:#18323b;max-width:850px;margin:40px auto;padding:0 28px}header{border-bottom:4px solid #127486;padding-bottom:18px;margin-bottom:24px}h1{margin:0 0 8px;font-size:30px}h2{font-size:18px;color:#127486;margin-top:28px}.meta{color:#5b717a}.badge{display:inline-block;background:#e8f5f2;color:#226b59;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:bold}table{width:100%;border-collapse:collapse;margin:16px 0 28px}th,td{padding:10px 12px;border-bottom:1px solid #dbe4e6;text-align:left;vertical-align:top}th{width:36%;color:#60747c;font-size:12px;text-transform:uppercase;letter-spacing:.04em}footer{font-size:12px;line-height:1.5;color:#63777f;border-top:1px solid #dbe4e6;padding-top:18px}.print{border:0;border-radius:7px;background:#127486;color:white;padding:10px 14px;font-weight:bold;cursor:pointer}@media print{body{margin:0;max-width:none}.print{display:none}}</style></head><body><header><span class="badge">USDA SSURGO</span><h1>Soil Survey Report</h1><p class="meta">Selected location: ${point[1].toFixed(6)}, ${point[0].toFixed(6)}<br>Generated by Geo Graph on ${escapeHtml(generated)}</p><button class="print" onclick="window.print()">Print or save as PDF</button></header><h2>${escapeHtml(soil.mapUnitName)}</h2><table>${table}</table><footer><strong>Source:</strong> USDA NRCS Soil Data Access / SSURGO. This report presents published representative values for the mapped soil unit at one selected coordinate. Soil properties vary within map units and should not replace an on-site investigation for engineering, environmental, or legal decisions.</footer></body></html>`;
    const url=URL.createObjectURL(new Blob([report],{type:"text/html;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`soil-survey-${point[1].toFixed(5)}-${point[0].toFixed(5)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  useEffect(()=>{
    let disposed=false;
    import("maplibre-gl").then(({Map,NavigationControl,ScaleControl,AttributionControl,setWorkerUrl})=>{
      if(disposed||!container.current)return;
      try{
        setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
        const m=new Map({container:container.current,center:[-18,24],zoom:1.65,pitch:0,bearing:0,maxZoom:18,maxPitch:65,centerClampedToGround:true,attributionControl:false,canvasContextAttributes:{antialias:true},style:{version:8,projection:{type:"globe"},sources:{
          satellite:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"},
          topo:{type:"raster",tiles:["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:16,attribution:"Topography: USGS (United States)"},
          terrain:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15,attribution:'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen and source contributors</a>'},
          hillshade:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15},
          geology:{type:"raster",tiles:[`${window.location.origin}/api/tiles/{z}/{x}/{y}`],tileSize:256,maxzoom:14,attribution:'<a href="https://macrostrat.org">Macrostrat</a> & original survey authors · CC BY 4.0'},
          faults:{type:"raster",tiles:["https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:11,attribution:"Faults: USGS Quaternary Fault and Fold Database"},
          openfreemap:{type:"vector",url:"https://tiles.openfreemap.org/planet",attribution:'<a href="https://openfreemap.org">OpenFreeMap</a> · © OpenStreetMap contributors'},
          selection:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
        },layers:[
          {id:"space",type:"background",paint:{"background-color":"#06111d"}},
          {id:"satellite",type:"raster",source:"satellite",paint:{"raster-saturation":-0.08,"raster-contrast":0.08}},
          {id:"topo",type:"raster",source:"topo",layout:{visibility:"none"}},
          {id:"terrain-shade",type:"hillshade",source:"hillshade",minzoom:5,paint:{"hillshade-shadow-color":"#17252b","hillshade-highlight-color":"#f0e4c8","hillshade-exaggeration":0.48}},
          {id:"geology",type:"raster",source:"geology",layout:{visibility:"none"},paint:{"raster-opacity":0.68}},
          {id:"faults",type:"raster",source:"faults",layout:{visibility:"none"}},
          {id:"3d-buildings",type:"fill-extrusion",source:"openfreemap","source-layer":"building",minzoom:14,layout:{visibility:"none"},paint:{
            "fill-extrusion-color":"#b8c5c8",
            "fill-extrusion-height":["get","render_height"],
            "fill-extrusion-base":["get","render_min_height"],"fill-extrusion-opacity":0.9,"fill-extrusion-vertical-gradient":true}},
          {id:"selection-halo",type:"circle",source:"selection",paint:{"circle-radius":20,"circle-color":"rgba(255,189,74,0.2)","circle-stroke-color":"#ffbd4a","circle-stroke-width":3,"circle-pitch-alignment":"map"}},
          {id:"selection-core",type:"circle",source:"selection",paint:{"circle-radius":4,"circle-color":"#fff","circle-stroke-color":"#0b3340","circle-stroke-width":2,"circle-pitch-alignment":"map"}},
        ],terrain:{source:"terrain",exaggeration:1.35},sky:{}}});
        map.current=m;m.addControl(new NavigationControl({visualizePitch:true}),"top-right");m.addControl(new ScaleControl(),"bottom-left");m.addControl(new AttributionControl({compact:true}),"bottom-right");
        m.setCenterClampedToGround(true);
        m.on("load",()=>setReady(true));m.on("move",()=>{const z=m.getZoom();setZoom(z);setMode(z<5?"GLOBE":z<14?"TERRAIN":"CITY");});
        m.on("zoomend",()=>{const z=m.getZoom();m.setProjection({type:z<5?"globe":"mercator"});if(!terrainRevealDone.current&&z>=9&&m.getPitch()<50){terrainRevealDone.current=true;m.easeTo({pitch:55,bearing:-22,duration:900});}});
        m.on("moveend",()=>{m.setCenterClampedToGround(true);setSceneLoading(false);});
        m.on("click",e=>{const hits=m.queryRenderedFeatures(e.point,{layers:["3d-buildings"]});void inspectGround(e.lngLat.wrap().lng,e.lngLat.lat,hits.length?buildingFromFeature(hits[0]):null);});
        m.on("mouseenter","3d-buildings",()=>{m.getCanvas().style.cursor="pointer";});m.on("mouseleave","3d-buildings",()=>{m.getCanvas().style.cursor="";});m.on("error",e=>{if(e.error)setMapError("One map source could not load. The other layers remain available.");});
      }catch{setMapError("The 3D globe could not start. Reload in a browser with WebGL enabled.");}
    }).catch(()=>setMapError("The map renderer could not load. Please reload the page."));
    return()=>{disposed=true;request.current?.abort();map.current?.remove();map.current=null;};
  },[]);

  useEffect(()=>{const m=map.current;if(!m||!ready)return;m.setLayoutProperty("satellite","visibility",base==="satellite"?"visible":"none");m.setLayoutProperty("topo","visibility",base==="topo"?"visible":"none");m.setLayoutProperty("terrain-shade","visibility",hillshade?"visible":"none");m.setLayoutProperty("geology","visibility",geology?"visible":"none");m.setLayoutProperty("faults","visibility",faults?"visible":"none");m.setLayoutProperty("3d-buildings","visibility",buildings?"visible":"none");m.setTerrain(hillshade?{source:"terrain",exaggeration:1.35}:null);m.setCenterClampedToGround(true);},[ready,base,hillshade,geology,faults,buildings]);

  function goToView(view:typeof VIEWS[number]){const m=map.current;if(!m)return;terrainRevealDone.current=view.zoom>=9;setSceneLoading(true);m.setProjection({type:view.zoom<5?"globe":"mercator"});if(view.zoom>=14){m.setTerrain(null);m.setLayoutProperty("terrain-shade","visibility","none");m.setLayoutProperty("3d-buildings","visibility","visible");setBuildings(true);setHillshade(false);}else{m.setLayoutProperty("3d-buildings","visibility","none");m.setLayoutProperty("terrain-shade","visibility","visible");m.setTerrain({source:"terrain",exaggeration:1.35});setBuildings(false);setHillshade(true);}m.setCenterClampedToGround(true);m.flyTo({center:view.point,zoom:view.zoom,pitch:Math.min(view.pitch,60),bearing:view.bearing,duration:2600,essential:true});setPlaces([]);if(view.zoom>8)void inspectGround(view.point[0],view.point[1]);else{(m.getSource("selection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});setPoint(null);setResult(null);setSoil(null);setBuilding(null);}}
  function closeTerrain(){const m=map.current;if(!m)return;terrainRevealDone.current=true;setSceneLoading(true);m.setCenterClampedToGround(true);m.easeTo({zoom:Math.max(m.getZoom(),13),pitch:56,bearing:m.getBearing()||-24,duration:1200});}
  async function search(event:React.FormEvent){event.preventDefault();if(!query.trim())return;setSearchError("");setPlaces([]);const coords=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(coords){const lat=Number(coords[1]),lng=Number(coords[2]);if(Math.abs(lat)>85||Math.abs(lng)>180){setSearchError("Use latitude −85 to 85 and longitude −180 to 180.");return;}goToView({name:"Coordinates",icon:"",point:[lng,lat],zoom:16.3,pitch:58,bearing:-22});return;}setSearching(true);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);if(!response.ok)throw new Error("Place search is unavailable. Enter latitude, longitude instead.");const data=await response.json() as Place[];setPlaces(data);if(!data.length)setSearchError("No places found. Try a nearby city or latitude, longitude.");}catch(cause){setSearchError(cause instanceof Error?cause.message:"Search failed.");}finally{setSearching(false);}}
  const unit=result?.units[selected];
  return <main className="app-shell"><header><a className="brand" href="/" aria-label="Geo Graph home"><span className="brand-icon">◈</span> GEO GRAPH</a><span className="header-note">Earth → terrain → city</span><span className="view-readout"><b>{mode}</b><span>ZOOM {zoom.toFixed(1)}</span></span></header><div className="workspace"><aside>
    <section className="intro"><p className="eyebrow">EXPLORE THE PLANET</p><h1>Move from orbit to street level.</h1><p>Search anywhere, then tilt, rotate, and descend into the terrain. Buildings appear as you reach city scale.</p></section>
    <section><form onSubmit={search}><label htmlFor="search">Find a place</label><div className="search-row"><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="City, landmark, or coordinates"/><button disabled={searching||!ready}>{searching?"…":"Go"}</button></div></form>{searchError&&<p role="alert" className="error">{searchError}</p>}{places.length>0&&<ul className="places">{places.map((place,index)=><li key={`${place.name}-${index}`}><button onClick={()=>goToView({name:place.name,icon:"",point:place.point,zoom:16.3,pitch:58,bearing:-24})}>{place.name}</button></li>)}</ul>}<div className="journey">{VIEWS.map(view=><button disabled={!ready} key={view.name} onClick={()=>goToView(view)}><span>{view.icon}</span><small>{view.name}</small></button>)}</div></section>
    <section><p className="eyebrow">MAP DISPLAY</p><div className="base-switch"><button aria-pressed={base==="satellite"} onClick={()=>setBase("satellite")}>Satellite</button><button aria-pressed={base==="topo"} onClick={()=>setBase("topo")}>Topographic</button></div><div className="layer-grid"><button aria-pressed={hillshade} onClick={()=>{const next=!hillshade;setHillshade(next);if(next)setBuildings(false);}}><span className="layer-symbol terrain-symbol">△</span><b>Relief</b><small>3D terrain mode</small></button><button aria-pressed={buildings} onClick={()=>{const next=!buildings;setBuildings(next);if(next)setHillshade(false);}}><span className="layer-symbol building-symbol">▦</span><b>Buildings</b><small>3D city mode</small></button><button aria-pressed={geology} onClick={()=>setGeology(!geology)}><span className="layer-symbol geology-symbol">◒</span><b>Geology</b><small>Surface rock units</small></button><button aria-pressed={faults} onClick={()=>setFaults(!faults)}><span className="layer-symbol fault-symbol">⌁</span><b>Faults</b><small>U.S. mapped faults</small></button></div></section>
    <section className="inspector"><p className="eyebrow">SELECTED LOCATION</p>{!point?<div className="empty-state"><span className="select-icon">⌖</span><h2>Select the ground.</h2><p>Click a precise spot to read its USDA soil survey, mapped geology, and building data when available.</p></div>:<><div className="selection-heading"><div><p className="coordinates">{point[1].toFixed(5)}, {point[0].toFixed(5)}</p><h2>{building?building.name:"Ground selection"}</h2></div><span className="selected-badge">SELECTED</span></div>{building&&<article className="data-card building-card"><h3>Building</h3><dl className="fact-grid"><div><dt>Height</dt><dd>{building.height}</dd></div><div><dt>Levels</dt><dd>{building.levels}</dd></div></dl><p>{building.source}</p></article>}<article className="data-card soil-card"><div className="card-heading"><div><span className="card-icon">◫</span><h3>Soil survey</h3></div><span>USDA SSURGO</span></div>{soilLoading&&<p role="status" className="loading-line">Reading the soil profile…</p>}{soilError&&<p role="alert" className="error">{soilError} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{!soilLoading&&!soilError&&!soil&&<p>No detailed USDA soil polygon covers this point.</p>}{soil&&<><h4>{soil.mapUnitName}</h4><p className="muted-line">{soil.surveyAreaName} · {soil.mapUnitSymbol}</p><dl className="fact-grid"><div><dt>Major component</dt><dd>{soil.componentName||"Not specified"}{soil.componentPercent!=null?` · ${soil.componentPercent}%`:""}</dd></div><div><dt>Surface texture</dt><dd>{soil.texture||"Not rated"}</dd></div><div><dt>Drainage</dt><dd>{soil.drainageClass||"Not rated"}</dd></div><div><dt>Hydrologic group</dt><dd>{soil.hydrologicGroup||"Not rated"}</dd></div><div><dt>Slope</dt><dd>{soil.slopePercent!=null?`${soil.slopePercent}%`:"Not rated"}</dd></div><div><dt>Surface horizon</dt><dd>{soil.horizonName?`${soil.horizonName} · ${soil.horizonTopCm??0}–${soil.horizonBottomCm??"?"} cm`:"Not described"}</dd></div><div><dt>Organic matter</dt><dd>{soil.organicMatterPercent!=null?`${soil.organicMatterPercent}%`:"Not rated"}</dd></div><div><dt>pH</dt><dd>{soil.ph??"Not rated"}</dd></div></dl>{soil.taxonomicSubgroup&&<p className="taxonomy">{soil.taxonomicOrder} · {soil.taxonomicSubgroup}</p>}<details><summary>Texture fractions and survey ID</summary><dl className="fact-grid compact"><div><dt>Sand</dt><dd>{soil.sandPercent!=null?`${soil.sandPercent}%`:"—"}</dd></div><div><dt>Silt</dt><dd>{soil.siltPercent!=null?`${soil.siltPercent}%`:"—"}</dd></div><div><dt>Clay</dt><dd>{soil.clayPercent!=null?`${soil.clayPercent}%`:"—"}</dd></div><div><dt>Map unit key</dt><dd>{soil.mapUnitKey}</dd></div></dl></details></>}</article><article className="data-card geology-card"><div className="card-heading"><div><span className="card-icon geology-symbol">◒</span><h3>Surface geology</h3></div><span>MACROSTRAT</span></div>{loading&&<p role="status" className="loading-line">Reading mapped geology…</p>}{error&&<p role="alert" className="error">{error} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{result&&!result.units.length&&<p>No published rock units were returned at this point.</p>}{unit&&<><label htmlFor="survey">Survey interpretation</label><select id="survey" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{result!.units.map((item,index)=><option key={item.map_id} value={index}>{item.name||"Unnamed unit"}</option>)}</select><h4><span className="swatch" style={{background:/^#[0-9a-f]{6}$/i.test(unit.color)?unit.color:"#aaa"}}/>{unit.name}</h4><dl className="fact-grid"><div><dt>Rock type</dt><dd>{unit.lith?.replace(/[{}]/g," ")||"Not specified"}</dd></div><div><dt>Geologic age</dt><dd>{unit.best_int_name||[unit.b_int_name,unit.t_int_name].filter(Boolean).join(" – ")||"Not specified"}</dd></div></dl>{unit.descrip&&<p>{unit.descrip}</p>}<details><summary>Survey source</summary><p>{result!.refs[String(unit.source_id)]||"See the Macrostrat source record."}</p></details></>}</article></>}</section>
    {soil&&point&&<section className="report-export"><div><p className="eyebrow">FIELD REPORT</p><h2>Take this survey with you.</h2><p>Export the selected soil unit as a print-ready report, or save it as a PDF from your browser.</p></div><button className="export-button" onClick={exportSoilReport}>⇩ Export soil report</button></section>}
    <section className="coverage"><p>Soils: USDA NRCS Soil Data Access / SSURGO. Terrain: Mapzen and source contributors. Buildings: OpenFreeMap and OpenStreetMap. Geology: Macrostrat and original survey authors. Coverage and detail vary.</p></section>
  </aside><div className="map-shell"><div ref={container} className="map" aria-label="Interactive 3D globe and terrain"/>{!ready&&!mapError&&<div className="map-message" role="status">Building the globe…</div>}{sceneLoading&&<div className="scene-loading" role="status">Loading elevation and imagery…</div>}{mapError&&<div className="map-message error" role="alert">{mapError}<button onClick={()=>setMapError("")}>×</button></div>}<div className="mode-chip"><span>{mode}</span><strong>{mode==="GLOBE"?"Rotate the Earth":mode==="TERRAIN"?"Explore the relief":buildings?"Buildings enabled":"Relief close-up"}</strong></div><div className="camera-tools"><button onClick={()=>goToView(VIEWS[0])}>◎ Globe</button><button onClick={closeTerrain}>◢ Terrain view</button></div><div className="map-help">Scroll to descend · Drag to move · Two-finger drag or right-drag to orbit · Click to select</div></div></div></main>;
}
