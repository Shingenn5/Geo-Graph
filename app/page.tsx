"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as GLMap, Marker } from "maplibre-gl";
type Unit = { map_id:number; source_id:number; name:string; strat_name:string; lith:string; descrip:string; color:string; best_int_name:string; t_int_name:string; b_int_name:string };
type Result = { units:Unit[]; refs:Record<string,string> };
const start:[number,number]=[-112.112,36.106];
const presets=[{name:"Grand Canyon",point:start},{name:"Mount St. Helens",point:[-122.194,46.191] as [number,number]},{name:"San Andreas Fault",point:[-119.72,35.12] as [number,number]}];
export default function Home(){
 const container=useRef<HTMLDivElement>(null),map=useRef<GLMap|null>(null),marker=useRef<Marker|null>(null),request=useRef<AbortController|null>(null);
 const [ready,setReady]=useState(false),[base,setBase]=useState("satellite"),[geology,setGeology]=useState(false),[faults,setFaults]=useState(false),[terrain,setTerrain]=useState(true),[opacity,setOpacity]=useState(70),[exaggeration,setExaggeration]=useState(1.5);
 const [point,setPoint]=useState<[number,number]|null>(null),[result,setResult]=useState<Result|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[mapError,setMapError]=useState("");
 const [query,setQuery]=useState(""),[places,setPlaces]=useState<{name:string;point:[number,number]}[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(""),[selected,setSelected]=useState(0);
 async function inspect(lng:number,lat:number){
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setPoint([lng,lat]);setLoading(true);setError("");setResult(null);setSelected(0);
  try{
   if(map.current){const {Marker}=await import("maplibre-gl");if(controller.signal.aborted)return;marker.current?.remove();marker.current=new Marker({color:"#f5b942"}).setLngLat([lng,lat]).addTo(map.current);}
   const response=await fetch(`/api/geology?lng=${lng}&lat=${lat}`,{signal:controller.signal});
   if(!response.ok)throw new Error("Geology lookup is unavailable. Try this point again shortly.");setResult(await response.json());
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load geology.");}finally{if(!controller.signal.aborted)setLoading(false);}
 }
 useEffect(()=>{
  let disposed=false;
  import("maplibre-gl").then(({Map,NavigationControl,ScaleControl,AttributionControl,setWorkerUrl})=>{
   if(disposed||!container.current)return;
   try{
    setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);const m=new Map({container:container.current,center:start,zoom:11.8,pitch:58,bearing:-22,maxZoom:17,attributionControl:false,style:{version:8,sources:{
     satellite:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"},
     topo:{type:"raster",tiles:["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:16,attribution:"Topography: USGS (United States)"},
     elevation:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15,attribution:'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen / source credits</a>'},
     geology:{type:"raster",tiles:[`${window.location.origin}/api/tiles/{z}/{x}/{y}`],tileSize:256,maxzoom:14,attribution:'<a href="https://macrostrat.org">Macrostrat</a> & original survey authors · CC BY 4.0'},
     faults:{type:"raster",tiles:["https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:11,attribution:"Faults: USGS Quaternary Fault and Fold Database"}
    },layers:[{id:"background",type:"background",paint:{"background-color":"#cbd6da"}},{id:"satellite",type:"raster",source:"satellite"},{id:"topo",type:"raster",source:"topo",layout:{visibility:"none"}},{id:"geology",type:"raster",source:"geology",layout:{visibility:"none"},paint:{"raster-opacity":0.7}},{id:"faults",type:"raster",source:"faults",layout:{visibility:"none"}}],terrain:{source:"elevation",exaggeration:1.5}}});
    map.current=m;m.addControl(new NavigationControl({visualizePitch:true}),"top-right");m.addControl(new ScaleControl(),"bottom-left");m.addControl(new AttributionControl({compact:true}),"bottom-right");
    m.on("style.load",()=>setReady(true));m.on("click",e=>void inspect(e.lngLat.wrap().lng,e.lngLat.lat));m.on("error",e=>{if(e.error)setMapError("A map source could not load. Check your connection or switch layers.");});
   }catch{setMapError("The 3D map could not start. Use a browser with WebGL enabled and reload.");}
  }).catch(()=>setMapError("The map could not load. Please reload the page."));
  return()=>{disposed=true;request.current?.abort();marker.current?.remove();map.current?.remove();map.current=null;};
 },[]);
 useEffect(()=>{const m=map.current;if(!m||!ready)return;m.setLayoutProperty("satellite","visibility",base==="satellite"?"visible":"none");m.setLayoutProperty("topo","visibility",base==="topo"?"visible":"none");m.setLayoutProperty("geology","visibility",geology?"visible":"none");m.setLayoutProperty("faults","visibility",faults?"visible":"none");m.setPaintProperty("geology","raster-opacity",opacity/100);m.setTerrain(terrain?{source:"elevation",exaggeration}:null);},[ready,base,geology,faults,opacity,terrain,exaggeration]);
 function fly(p:[number,number]){map.current?.flyTo({center:p,zoom:11.8,pitch:terrain?58:0,essential:false});setPlaces([]);void inspect(p[0],p[1]);}
 async function search(e:React.FormEvent){
  e.preventDefault();if(!query.trim())return;setSearchError("");setPlaces([]);
  const coords=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if(coords){const lat=Number(coords[1]),lng=Number(coords[2]);if(Math.abs(lat)>85||Math.abs(lng)>180){setSearchError("Use latitude −85 to 85 and longitude −180 to 180.");return;}fly([lng,lat]);return;}
  setSearching(true);try{const r=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);if(!r.ok)throw new Error("Place search is unavailable. Enter latitude, longitude instead.");const data=await r.json() as {name:string;point:[number,number]}[];setPlaces(data);if(!data.length)setSearchError("No places found. Try a nearby town or latitude, longitude.");}catch(e){setSearchError(e instanceof Error?e.message:"Search failed.");}finally{setSearching(false);}
 }
 const unit=result?.units[selected];
 return <main><header><a className="brand" href="/" aria-label="Geo Graph home"><span className="brand-icon">◈</span> GEO GRAPH</a><span className="header-note">3D geological explorer</span><span className="version">SURFACE EXPLORER / 01</span></header><div className="workspace"><aside>
  <section><p className="eyebrow">01 / FIND A LOCATION</p><form onSubmit={search}><label htmlFor="search">Where do you want to explore?</label><div className="search-row"><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Place or latitude, longitude"/><button disabled={searching||!ready} aria-label="Search location">{searching?"…":"Go"}</button></div></form>{searchError&&<p role="alert" className="error">{searchError}</p>}{places.length>0&&<ul className="places">{places.map((p,i)=><li key={i}><button onClick={()=>fly(p.point)}>{p.name}</button></li>)}</ul>}<div className="presets">{presets.map(p=><button disabled={!ready} key={p.name} onClick={()=>fly(p.point)}>{p.name}</button>)}</div></section>
  <section><p className="eyebrow">02 / EXPLORE THE LAYERS</p><fieldset disabled={!ready}><legend>Base map</legend><div className="segmented">{["satellite","topo"].map(b=><button type="button" key={b} aria-pressed={base===b} onClick={()=>{setBase(b);setMapError("");}}>{b==="satellite"?"Satellite":"Topographic"}</button>)}</div>{base==="topo"&&<p className="muted">USGS topographic coverage: United States.</p>}
   <label className="layer"><span><strong>3D terrain</strong><small>Elevation, ridges, and valleys</small></span><input type="checkbox" checked={terrain} onChange={e=>{setTerrain(e.target.checked);map.current?.easeTo({pitch:e.target.checked?58:0});}}/></label>
   {terrain&&<label className="slider">Vertical exaggeration <output>{exaggeration.toFixed(1)}×</output><input aria-label="Vertical exaggeration" type="range" min="1" max="3" step="0.1" value={exaggeration} onChange={e=>setExaggeration(Number(e.target.value))}/></label>}
   <label className="layer"><span><strong>Surface geology</strong><small>Mapped rock units and geologic age</small></span><input type="checkbox" checked={geology} onChange={e=>{setGeology(e.target.checked);setMapError("");}}/></label>
   {geology&&<label className="slider">Geology opacity <output>{opacity}%</output><input aria-label="Geology opacity" type="range" min="10" max="100" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label>}
   <label className="layer"><span><strong>Mapped faults</strong><small>USGS Quaternary faults · U.S. coverage</small></span><input type="checkbox" checked={faults} onChange={e=>{setFaults(e.target.checked);setMapError("");}}/></label>
   {faults&&<p className="muted">Fault lines retain USGS source colors. <a href="https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/legend" target="_blank" rel="noreferrer">View fault legend ↗</a></p>}
  </fieldset></section>
  <section className="information"><p className="eyebrow">03 / INSPECT THE GROUND</p>{!point?<><h2>Every landscape has a history.</h2><p>Click the ground to see published rock types, geologic age, and the original survey source.</p></>:<><p className="coordinates">{point[1].toFixed(5)}, {point[0].toFixed(5)}</p>{loading&&<p role="status">Looking up mapped geology…</p>}{error&&<p role="alert" className="error">{error} <button onClick={()=>inspect(...point)}>Retry</button></p>}{result&&!result.units.length&&<p>No published rock units were returned here. Try another point; a blank result does not mean there is no rock or no fault.</p>}{unit&&<><label htmlFor="survey">Survey record</label><select id="survey" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{result!.units.map((u,i)=><option key={u.map_id} value={i}>{u.name||"Unnamed rock unit"} · source {u.source_id}</option>)}</select><p className="muted">These are overlapping survey interpretations, not stacked underground layers.</p><h2><span className="swatch" style={{background:/^#[0-9a-f]{6}$/i.test(unit.color)?unit.color:"#aaa"}}/>{unit.name}</h2><dl><dt>Rock type</dt><dd>{unit.lith?.replace(/[{}]/g," ")||"Not specified in this record"}</dd><dt>Geologic age</dt><dd>{unit.best_int_name||[unit.b_int_name,unit.t_int_name].filter(Boolean).join(" – ")||"Not specified"}</dd>{unit.strat_name&&<><dt>Formation</dt><dd>{unit.strat_name}</dd></>}</dl>{unit.descrip&&<p>{unit.descrip}</p>}<details><summary>Original survey & attribution</summary><p>{result!.refs[String(unit.source_id)]||"See source record for attribution."}</p><a href={`https://macrostrat.org/api/v2/defs/sources?source_id=${unit.source_id}`} target="_blank" rel="noreferrer">View source record ↗</a></details></>}</>}</section>
  <section className="coverage"><strong>About these layers</strong><p>Geology comes from published maps, not an inference from satellite images. Coverage and detail vary. Colors follow the source cartography. Surface maps do not establish rock depth or thickness.</p><p>Underground cutaways are planned for a later version with depth data.</p><a href="https://tiles.macrostrat.org/" target="_blank" rel="noreferrer">Macrostrat & original map authors ↗</a><p>Place search: Photon / OpenStreetMap contributors.</p></section>
 </aside><div className="map-shell"><div ref={container} className="map" aria-label="Interactive 3D terrain map"/>{!ready&&!mapError&&<div className="map-message" role="status">Loading the terrain…</div>}{mapError&&<div className="map-message error" role="alert">{mapError}<button onClick={()=>setMapError("")} aria-label="Dismiss map warning">×</button></div>}<div className="map-caption"><span>{terrain?"3D TERRAIN":"2D MAP"}</span><strong>{base==="satellite"?"Satellite":"Topographic"}{geology?" + geology":""}{faults?" + faults":""}</strong></div><div className="map-help">Drag to explore · Right-drag to tilt · Click to inspect</div></div></div></main>;
}




