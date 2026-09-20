"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as GLMap, Marker, MapGeoJSONFeature } from "maplibre-gl";

type Unit = { map_id:number; source_id:number; name:string; strat_name:string; lith:string; descrip:string; color:string; best_int_name:string; t_int_name:string; b_int_name:string };
type GeologyResult = { units:Unit[]; refs:Record<string,string> };
type Place = { name:string; point:[number,number] };
type Building = { name:string; height:string; levels:string; source:string };
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

export default function GeoExplorer(){
  const container=useRef<HTMLDivElement>(null), map=useRef<GLMap|null>(null), marker=useRef<Marker|null>(null), request=useRef<AbortController|null>(null), terrainRevealDone=useRef(false);
  const [ready,setReady]=useState(false),[mode,setMode]=useState<ViewMode>("GLOBE"),[zoom,setZoom]=useState(1.65),[base,setBase]=useState<"satellite"|"topo">("satellite"),[geology,setGeology]=useState(false),[faults,setFaults]=useState(false),[buildings,setBuildings]=useState(false),[hillshade,setHillshade]=useState(true),[exaggeration,setExaggeration]=useState(1.35);
  const [query,setQuery]=useState(""),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [point,setPoint]=useState<[number,number]|null>(null),[result,setResult]=useState<GeologyResult|null>(null),[selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[mapError,setMapError]=useState(""),[building,setBuilding]=useState<Building|null>(null),[sceneLoading,setSceneLoading]=useState(false);

  async function inspectGround(lng:number,lat:number){
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setPoint([lng,lat]);setBuilding(null);setLoading(true);setError("");setResult(null);setSelected(0);
    try{
      if(map.current){const {Marker}=await import("maplibre-gl");if(controller.signal.aborted)return;marker.current?.remove();marker.current=new Marker({color:"#ffbd4a"}).setLngLat([lng,lat]).addTo(map.current);}
      const response=await fetch(`/api/geology?lng=${lng}&lat=${lat}`,{signal:controller.signal});if(!response.ok)throw new Error("Geology lookup is unavailable. Try again shortly.");setResult(await response.json());
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Could not load geology.");}finally{if(!controller.signal.aborted)setLoading(false);}
  }

  useEffect(()=>{
    let disposed=false;
    import("maplibre-gl").then(({Map,NavigationControl,ScaleControl,AttributionControl,setWorkerUrl})=>{
      if(disposed||!container.current)return;
      try{
        setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
        const m=new Map({container:container.current,center:[-18,24],zoom:1.65,pitch:0,bearing:0,maxZoom:18,maxPitch:85,attributionControl:false,canvasContextAttributes:{antialias:true},style:{version:8,projection:{type:"globe"},sources:{
          satellite:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"},
          topo:{type:"raster",tiles:["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:16,attribution:"Topography: USGS (United States)"},
          terrain:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15,attribution:'Elevation: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen and source contributors</a>'},
          hillshade:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15},
          geology:{type:"raster",tiles:[`${window.location.origin}/api/tiles/{z}/{x}/{y}`],tileSize:256,maxzoom:14,attribution:'<a href="https://macrostrat.org">Macrostrat</a> & original survey authors · CC BY 4.0'},
          faults:{type:"raster",tiles:["https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:11,attribution:"Faults: USGS Quaternary Fault and Fold Database"},
          openfreemap:{type:"vector",url:"https://tiles.openfreemap.org/planet",attribution:'<a href="https://openfreemap.org">OpenFreeMap</a> · © OpenStreetMap contributors'},
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
        ],terrain:{source:"terrain",exaggeration:1.35},sky:{}}});
        map.current=m;m.addControl(new NavigationControl({visualizePitch:true}),"top-right");m.addControl(new ScaleControl(),"bottom-left");m.addControl(new AttributionControl({compact:true}),"bottom-right");
        m.on("load",()=>setReady(true));m.on("move",()=>{const z=m.getZoom();setZoom(z);setMode(z<5?"GLOBE":z<14?"TERRAIN":"CITY");});
        m.on("zoomend",()=>{const z=m.getZoom();m.setProjection({type:z<5?"globe":"mercator"});if(!terrainRevealDone.current&&z>=9&&m.getPitch()<50){terrainRevealDone.current=true;m.easeTo({pitch:55,bearing:-22,duration:900});}});
        m.on("moveend",()=>setSceneLoading(false));
        m.on("click",e=>{const hits=m.queryRenderedFeatures(e.point,{layers:["3d-buildings"]});if(hits.length){setBuilding(buildingFromFeature(hits[0]));setPoint([e.lngLat.lng,e.lngLat.lat]);marker.current?.remove();setResult(null);setError("");}else void inspectGround(e.lngLat.wrap().lng,e.lngLat.lat);});
        m.on("mouseenter","3d-buildings",()=>{m.getCanvas().style.cursor="pointer";});m.on("mouseleave","3d-buildings",()=>{m.getCanvas().style.cursor="";});m.on("error",e=>{if(e.error)setMapError("One map source could not load. The other layers remain available.");});
      }catch{setMapError("The 3D globe could not start. Reload in a browser with WebGL enabled.");}
    }).catch(()=>setMapError("The map renderer could not load. Please reload the page."));
    return()=>{disposed=true;request.current?.abort();marker.current?.remove();map.current?.remove();map.current=null;};
  },[]);

  useEffect(()=>{const m=map.current;if(!m||!ready)return;m.setLayoutProperty("satellite","visibility",base==="satellite"?"visible":"none");m.setLayoutProperty("topo","visibility",base==="topo"?"visible":"none");m.setLayoutProperty("terrain-shade","visibility",hillshade?"visible":"none");m.setLayoutProperty("geology","visibility",geology?"visible":"none");m.setLayoutProperty("faults","visibility",faults?"visible":"none");m.setLayoutProperty("3d-buildings","visibility",buildings?"visible":"none");m.setTerrain(hillshade?{source:"terrain",exaggeration}:null);},[ready,base,hillshade,geology,faults,buildings,exaggeration]);

  function goToView(view:typeof VIEWS[number]){const m=map.current;if(!m)return;terrainRevealDone.current=view.zoom>=9;setSceneLoading(true);m.setProjection({type:view.zoom<5?"globe":"mercator"});if(view.zoom>=14){m.setTerrain(null);m.setLayoutProperty("terrain-shade","visibility","none");m.setLayoutProperty("3d-buildings","visibility","visible");setBuildings(true);setHillshade(false);}else{m.setLayoutProperty("3d-buildings","visibility","none");m.setLayoutProperty("terrain-shade","visibility","visible");m.setTerrain({source:"terrain",exaggeration});setBuildings(false);setHillshade(true);}m.flyTo({center:view.point,zoom:view.zoom,pitch:view.pitch,bearing:view.bearing,duration:2600,essential:true});setPlaces([]);if(view.zoom>8)void inspectGround(view.point[0],view.point[1]);else{marker.current?.remove();setPoint(null);setResult(null);setBuilding(null);}}
  function closeTerrain(){const m=map.current;if(!m)return;terrainRevealDone.current=true;setSceneLoading(true);m.easeTo({zoom:Math.max(m.getZoom(),13),pitch:56,bearing:m.getBearing()||-24,duration:1200});}
  async function search(event:React.FormEvent){event.preventDefault();if(!query.trim())return;setSearchError("");setPlaces([]);const coords=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(coords){const lat=Number(coords[1]),lng=Number(coords[2]);if(Math.abs(lat)>85||Math.abs(lng)>180){setSearchError("Use latitude −85 to 85 and longitude −180 to 180.");return;}goToView({name:"Coordinates",icon:"",point:[lng,lat],zoom:16.3,pitch:58,bearing:-22});return;}setSearching(true);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);if(!response.ok)throw new Error("Place search is unavailable. Enter latitude, longitude instead.");const data=await response.json() as Place[];setPlaces(data);if(!data.length)setSearchError("No places found. Try a nearby city or latitude, longitude.");}catch(cause){setSearchError(cause instanceof Error?cause.message:"Search failed.");}finally{setSearching(false);}}
  const unit=result?.units[selected];
  return <main className="app-shell"><header><a className="brand" href="/" aria-label="Geo Graph home"><span className="brand-icon">◈</span> GEO GRAPH</a><span className="header-note">Earth → terrain → city</span><span className="view-readout"><b>{mode}</b><span>ZOOM {zoom.toFixed(1)}</span></span></header><div className="workspace"><aside>
    <section className="intro"><p className="eyebrow">EXPLORE THE PLANET</p><h1>Move from orbit to street level.</h1><p>Search anywhere, then tilt, rotate, and descend into the terrain. Buildings appear as you reach city scale.</p></section>
    <section><form onSubmit={search}><label htmlFor="search">Find a place</label><div className="search-row"><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="City, landmark, or coordinates"/><button disabled={searching||!ready}>{searching?"…":"Go"}</button></div></form>{searchError&&<p role="alert" className="error">{searchError}</p>}{places.length>0&&<ul className="places">{places.map((place,index)=><li key={`${place.name}-${index}`}><button onClick={()=>goToView({name:place.name,icon:"",point:place.point,zoom:16.3,pitch:58,bearing:-24})}>{place.name}</button></li>)}</ul>}<div className="journey">{VIEWS.map(view=><button disabled={!ready} key={view.name} onClick={()=>goToView(view)}><span>{view.icon}</span><small>{view.name}</small></button>)}</div></section>
    <section><p className="eyebrow">VISIBLE LAYERS</p><div className="base-switch"><button aria-pressed={base==="satellite"} onClick={()=>setBase("satellite")}>Satellite</button><button aria-pressed={base==="topo"} onClick={()=>setBase("topo")}>Topographic</button></div><div className="layer-grid"><button aria-pressed={hillshade} onClick={()=>{const next=!hillshade;setHillshade(next);if(next)setBuildings(false);}}><span className="layer-symbol terrain-symbol">△</span><b>Relief</b><small>3D terrain mode</small></button><button aria-pressed={buildings} onClick={()=>{const next=!buildings;setBuildings(next);if(next)setHillshade(false);}}><span className="layer-symbol building-symbol">▦</span><b>Buildings</b><small>3D city mode</small></button><button aria-pressed={geology} onClick={()=>setGeology(!geology)}><span className="layer-symbol geology-symbol">◒</span><b>Geology</b><small>Surface rock units</small></button><button aria-pressed={faults} onClick={()=>setFaults(!faults)}><span className="layer-symbol fault-symbol">⌁</span><b>Faults</b><small>U.S. mapped faults</small></button></div><label className="slider">Terrain height <output>{exaggeration.toFixed(2)}×</output><input aria-label="Terrain height" type="range" min="1" max="2.5" step="0.05" value={exaggeration} onChange={e=>setExaggeration(Number(e.target.value))}/></label></section>
    <section className="inspector"><p className="eyebrow">INSPECT</p>{building?<><p className="coordinates">{point?.[1].toFixed(5)}, {point?.[0].toFixed(5)}</p><h2>{building.name}</h2><dl><dt>Rendered height</dt><dd>{building.height}</dd><dt>Mapped levels</dt><dd>{building.levels}</dd><dt>Source</dt><dd>{building.source}</dd></dl></>:!point?<><h2>Click the world.</h2><p>Select a building at city scale or any point on the ground to inspect its mapped geology.</p></>:<><p className="coordinates">{point[1].toFixed(5)}, {point[0].toFixed(5)}</p>{loading&&<p role="status">Reading the geology…</p>}{error&&<p role="alert" className="error">{error} <button onClick={()=>inspectGround(...point)}>Retry</button></p>}{result&&!result.units.length&&<p>No published rock units were returned at this point.</p>}{unit&&<><label htmlFor="survey">Survey interpretation</label><select id="survey" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{result!.units.map((item,index)=><option key={item.map_id} value={index}>{item.name||"Unnamed unit"}</option>)}</select><h2><span className="swatch" style={{background:/^#[0-9a-f]{6}$/i.test(unit.color)?unit.color:"#aaa"}}/>{unit.name}</h2><dl><dt>Rock type</dt><dd>{unit.lith?.replace(/[{}]/g," ")||"Not specified"}</dd><dt>Geologic age</dt><dd>{unit.best_int_name||[unit.b_int_name,unit.t_int_name].filter(Boolean).join(" – ")||"Not specified"}</dd></dl>{unit.descrip&&<p>{unit.descrip}</p>}<details><summary>Survey source</summary><p>{result!.refs[String(unit.source_id)]||"See the Macrostrat source record."}</p></details></>}</>}</section>
    <section className="coverage"><p>Terrain: Mapzen and source contributors. Buildings: OpenFreeMap and OpenStreetMap contributors. Geology: Macrostrat and original survey authors. Coverage and detail vary.</p></section>
  </aside><div className="map-shell"><div ref={container} className="map" aria-label="Interactive 3D globe and terrain"/>{!ready&&!mapError&&<div className="map-message" role="status">Building the globe…</div>}{sceneLoading&&<div className="scene-loading" role="status">Loading elevation and imagery…</div>}{mapError&&<div className="map-message error" role="alert">{mapError}<button onClick={()=>setMapError("")}>×</button></div>}<div className="mode-chip"><span>{mode}</span><strong>{mode==="GLOBE"?"Rotate the Earth":mode==="TERRAIN"?"Explore the relief":buildings?"Buildings enabled":"Relief close-up"}</strong></div><div className="camera-tools"><button onClick={()=>goToView(VIEWS[0])}>◎ Globe</button><button onClick={closeTerrain}>◢ Terrain view</button></div><div className="map-help">Scroll to descend · Drag to move · Two-finger drag or right-drag to orbit · Click to inspect</div></div></div></main>;
}
