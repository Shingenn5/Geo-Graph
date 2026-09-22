"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as GLMap, MapGeoJSONFeature } from "maplibre-gl";

type Unit = { map_id:number; source_id:number; name:string; strat_name:string; lith:string; descrip:string; color:string; best_int_name:string; t_int_name:string; b_int_name:string };
type GeologyResult = { units:Unit[]; refs:Record<string,string> };
type Place = { name:string; point:[number,number] };
type Building = { name:string; height:string; levels:string; source:string };
type Horizon = { key:string; name:string|null; topCm:number|null; bottomCm:number|null; texture:string|null; sandPercent:number|null; siltPercent:number|null; clayPercent:number|null; rockFragmentsPercent:number|null; organicMatterPercent:number|null; ph:number|null; availableWaterCapacity:number|null; saturatedHydraulicConductivity:number|null; bulkDensity:number|null; erosionKFactor:number|null; liquidLimit:number|null; plasticityIndex:number|null; cationExchangeCapacity:number|null; electricalConductivity:number|null };
type Soil = { mapUnitKey:string; mapUnitSymbol:string; mapUnitName:string; surveyAreaSymbol:string; surveyAreaName:string; surveyMatchCount:number|null; componentName:string|null; componentKind:string|null; majorComponent:boolean; componentPercent:number|null; taxonomicOrder:string|null; taxonomicSubgroup:string|null; taxonomicClass:string|null; drainageClass:string|null; hydrologicGroup:string|null; slopeLowPercent:number|null; slopePercent:number|null; slopeHighPercent:number|null; runoffClass:string|null; hydricRating:string|null; hydricCondition:string|null; floodingFrequency:string|null; pondingFrequency:string|null; concreteCorrosion:string|null; steelCorrosion:string|null; frostAction:string|null; nonIrrigatedCapabilityClass:string|null; irrigatedCapabilityClass:string|null; restrictionKind:string|null; restrictionDepthCm:number|null; profileAvailableWaterStorageMm:number|null; horizonName:string|null; horizonTopCm:number|null; horizonBottomCm:number|null; texture:string|null; sandPercent:number|null; siltPercent:number|null; clayPercent:number|null; organicMatterPercent:number|null; ph:number|null; availableWaterCapacity:number|null; permeability:string|null; horizons:Horizon[] };
type SoilResult = { soil:Soil|null; source?:string };
type ViewMode = "GLOBE" | "TERRAIN";
type UseCase = "Overview" | "Agriculture" | "Water" | "Construction" | "Environment";
type SurfaceMode = "Natural" | "Bare Earth" | "Geology" | "Soil";

const GLOBE_ENTER_ZOOM=4.5;
const TERRAIN_ENTER_ZOOM=5.25;

const USE_CASES:UseCase[]=["Overview","Agriculture","Water","Construction","Environment"];
const SURFACE_MODES:SurfaceMode[]=["Natural","Bare Earth","Geology","Soil"];
const SURFACE_COPY:Record<SurfaceMode,{icon:string;title:string;body:string;source:string;swatches:string[]}>= {
  Natural:{icon:"◈",title:"Natural surface",body:"Full-color imagery over detailed terrain with subtle relief.",source:"Esri / USGS imagery + Mapterhorn elevation",swatches:["#6f8060","#a48a67","#d3c4a2"]},
  "Bare Earth":{icon:"△",title:"Bare-earth elevation",body:"A hypsometric elevation material with terrain form emphasized above imagery.",source:"Mapterhorn elevation",swatches:["#486e68","#9a9868","#b67e60","#e2ded0"]},
  Geology:{icon:"◒",title:"Surface geology",body:"Published rock-unit mapping draped across the three-dimensional surface.",source:"Macrostrat + survey authors",swatches:["#bd6a75","#d49b62","#7e9d75"]},
  Soil:{icon:"▦",title:"Soil map units",body:"USDA SSURGO map-unit polygons over a subdued terrain underlay. U.S. coverage only.",source:"USDA NRCS Soil Data Access",swatches:["#d9c899","#aa9368","#7f6953"]},
};
const USE_CASE_COPY:Record<UseCase,{title:string;body:string;fields:string[]}>= {
  Overview:{title:"Survey overview",body:"A quick read of the mapped soil unit and the location context.",fields:["Map unit","Texture","Drainage","Slope"]},
  Agriculture:{title:"Agriculture lens",body:"Use texture, organic matter, pH, and water behavior as a starting point for field planning.",fields:["Texture","Organic matter","pH","Hydrologic group"]},
  Water:{title:"Water lens",body:"Review drainage and hydrologic group before planning runoff, infiltration, or wetland work.",fields:["Drainage","Hydrologic group","Flooding","Ponding"]},
  Construction:{title:"Construction lens",body:"Check mapped slope, depth, texture, and drainage before a site visit or preliminary design.",fields:["Slope","Surface horizon","Texture","Drainage"]},
  Environment:{title:"Environment lens",body:"Keep the mapped taxonomy and surface properties together for restoration and habitat context.",fields:["Taxonomy","Organic matter","pH","Surface horizon"]},
};

const VIEWS = [
  { name:"Earth", icon:"◎", point:[-18,24] as [number,number], zoom:1.65, pitch:0, bearing:0 },
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
  const container=useRef<HTMLDivElement>(null), map=useRef<GLMap|null>(null), request=useRef<AbortController|null>(null), searchRequest=useRef<AbortController|null>(null), inspector=useRef<HTMLElement|null>(null), selectingRef=useRef(false), terrainRevealDone=useRef(true);
  const [ready,setReady]=useState(false),[mode,setMode]=useState<ViewMode>("TERRAIN"),[zoom,setZoom]=useState(10.5),[surfaceMode,setSurfaceMode]=useState<SurfaceMode>("Natural"),[base,setBase]=useState<"satellite"|"topo">("satellite"),[contours,setContours]=useState(false),[faults,setFaults]=useState(false),[borders,setBorders]=useState(true),[buildings,setBuildings]=useState(false);
  const [query,setQuery]=useState(""),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [point,setPoint]=useState<[number,number]|null>(null),[result,setResult]=useState<GeologyResult|null>(null),[selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[mapError,setMapError]=useState(""),[building,setBuilding]=useState<Building|null>(null),[sceneLoading,setSceneLoading]=useState(false);
  const [soil,setSoil]=useState<Soil|null>(null),[soilLoading,setSoilLoading]=useState(false),[soilError,setSoilError]=useState("");
  const [useCase,setUseCase]=useState<UseCase>("Overview");
  const [selecting,setSelecting]=useState(false);
  const [pbrEnabled,setPbrEnabled]=useState(false),[pbrStatus,setPbrStatus]=useState("Ready at close zoom");
  const pbrCanRender=pbrEnabled&&mode==="TERRAIN"&&surfaceMode==="Natural"&&base==="satellite"&&zoom>=15;
  const setSelectionMode=useCallback((active:boolean)=>{
    selectingRef.current=active;setSelecting(active);
    if(map.current)map.current.getCanvas().style.cursor=active?"crosshair":"";
  },[]);
  useEffect(()=>{
    const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape"){selectingRef.current=false;setSelecting(false);if(map.current)map.current.getCanvas().style.cursor="";}};
    window.addEventListener("keydown",cancel);
    return()=>window.removeEventListener("keydown",cancel);
  },[]);
  function applyUseCase(next:UseCase){
    setUseCase(next);setBase("satellite");
    const presets:Record<UseCase,{surface:SurfaceMode;contours:boolean;faults:boolean;pitch:number}>={
      Overview:{surface:"Natural",contours:false,faults:false,pitch:55},
      Agriculture:{surface:"Soil",contours:false,faults:false,pitch:25},
      Water:{surface:"Bare Earth",contours:true,faults:false,pitch:45},
      Construction:{surface:"Geology",contours:true,faults:true,pitch:55},
      Environment:{surface:"Natural",contours:true,faults:false,pitch:35},
    };
    const preset=presets[next];
    setSurfaceMode(preset.surface);setContours(preset.contours);setFaults(preset.faults);
    if(map.current&&map.current.getZoom()>=TERRAIN_ENTER_ZOOM)map.current.easeTo({pitch:preset.pitch,duration:600});
  }

  const inspectGround=useCallback(async(lng:number,lat:number,selectedBuilding:Building|null=null)=>{
    setSelectionMode(false);
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setPoint([lng,lat]);setBuilding(selectedBuilding);setLoading(true);setSoilLoading(true);setError("");setSoilError("");setResult(null);setSoil(null);setSelected(0);
    const selection=map.current?.getSource("selection") as GeoJSONSource|undefined;
    selection?.setData({type:"Feature",properties:{},geometry:{type:"Point",coordinates:[lng,lat]}});
    await Promise.allSettled([
      fetch(`/api/geology?lng=${lng}&lat=${lat}`,{signal:controller.signal})
        .then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<GeologyResult>;})
        .then(data=>{if(!controller.signal.aborted)setResult(data);})
        .catch(()=>{if(!controller.signal.aborted)setError("Geology lookup is unavailable. Try again shortly.");})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);}),
      fetch(`/api/soil?lng=${lng}&lat=${lat}`,{signal:controller.signal})
        .then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<SoilResult>;})
        .then(data=>{if(!controller.signal.aborted)setSoil(data.soil);})
        .catch(()=>{if(!controller.signal.aborted)setSoilError("USDA soil survey lookup is unavailable. Try again shortly.");})
        .finally(()=>{if(!controller.signal.aborted)setSoilLoading(false);})
    ]);
  },[setSelectionMode]);

  function clearSelection(){
    setSelectionMode(false);
    request.current?.abort();
    (map.current?.getSource("selection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});
    setPoint(null);setResult(null);setSoil(null);setBuilding(null);
    setLoading(false);setSoilLoading(false);setError("");setSoilError("");
  }

  function exportSoilReport(){
    if(!soil||!point)return;
    const value=(item:unknown,suffix="")=>item==null||item===""?"Not rated":`${escapeHtml(item)}${suffix}`;
    const rows=[
      ["Map unit",`${soil.mapUnitName} (${soil.mapUnitSymbol})`],["Map unit key",soil.mapUnitKey],["Survey area",`${soil.surveyAreaName} (${soil.surveyAreaSymbol})`],
      ["Major component",soil.componentName],["Component percentage",soil.componentPercent,"%"],["Taxonomic order",soil.taxonomicOrder],["Taxonomic subgroup",soil.taxonomicSubgroup],
      ["Drainage class",soil.drainageClass],["Hydrologic group",soil.hydrologicGroup],["Representative slope",soil.slopePercent,"%"],
      ["Runoff class",soil.runoffClass],["Flooding frequency",soil.floodingFrequency],["Ponding frequency",soil.pondingFrequency],["Hydric rating",soil.hydricRating],
      ["Restrictive layer",soil.restrictionKind],["Restriction depth",soil.restrictionDepthCm," cm"],["Profile available water storage",soil.profileAvailableWaterStorageMm," mm"],
      ["Concrete corrosion",soil.concreteCorrosion],["Steel corrosion",soil.steelCorrosion],["Frost action",soil.frostAction],["Non-irrigated capability class",soil.nonIrrigatedCapabilityClass],
      ["Surface horizon",soil.horizonName],["Horizon top",soil.horizonTopCm," cm"],["Horizon bottom",soil.horizonBottomCm," cm"],["Surface texture",soil.texture],
      ["Sand",soil.sandPercent,"%"],["Silt",soil.siltPercent,"%"],["Clay",soil.clayPercent,"%"],["Organic matter",soil.organicMatterPercent,"%"],["pH",soil.ph],
    ];
    const table=rows.map(([label,item,suffix])=>`<tr><th>${escapeHtml(label)}</th><td>${value(item,String(suffix??""))}</td></tr>`).join("");
    const horizonRows=soil.horizons.map(horizon=>`<tr><td>${value(horizon.name)}</td><td>${value(horizon.topCm)}–${value(horizon.bottomCm)} cm</td><td>${value(horizon.texture)}</td><td>${value(horizon.ph)}</td><td>${value(horizon.organicMatterPercent,"%")}</td><td>${value(horizon.availableWaterCapacity," cm/cm")}</td><td>${value(horizon.saturatedHydraulicConductivity," µm/s")}</td></tr>`).join("");
    const focusRows=useCaseFacts[useCase].map(([label,item])=>`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(item)}</td></tr>`).join("");
    const generated=new Date().toLocaleString();
    const report=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Geo Graph Soil Survey Report</title><style>body{font:15px Arial,sans-serif;color:#18323b;max-width:980px;margin:40px auto;padding:0 28px}header{border-bottom:4px solid #127486;padding-bottom:18px;margin-bottom:24px}h1{margin:0 0 8px;font-size:30px}h2{font-size:18px;color:#127486;margin-top:28px}.meta{color:#5b717a}.badge{display:inline-block;background:#e8f5f2;color:#226b59;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:bold}table{width:100%;border-collapse:collapse;margin:16px 0 28px}th,td{padding:9px 10px;border-bottom:1px solid #dbe4e6;text-align:left;vertical-align:top}th{color:#60747c;font-size:11px;text-transform:uppercase;letter-spacing:.04em}footer{font-size:12px;line-height:1.5;color:#63777f;border-top:1px solid #dbe4e6;padding-top:18px}.print{border:0;border-radius:7px;background:#127486;color:white;padding:10px 14px;font-weight:bold;cursor:pointer}@media print{body{margin:0;max-width:none}.print{display:none}}</style></head><body><header><span class="badge">USDA SSURGO</span><h1>Soil Survey Report</h1><p class="meta">Selected location: ${point[1].toFixed(6)}, ${point[0].toFixed(6)}<br>Generated by Geo Graph on ${escapeHtml(generated)}</p><button class="print" onclick="window.print()">Print or save as PDF</button></header><h2>${escapeHtml(useCase)} workspace findings</h2><table>${focusRows}</table><h2>${escapeHtml(soil.mapUnitName)}</h2><table>${table}</table><h2>Dominant component horizon profile</h2><table><thead><tr><th>Horizon</th><th>Depth</th><th>Texture</th><th>pH</th><th>Organic matter</th><th>Available water</th><th>Ksat</th></tr></thead><tbody>${horizonRows||'<tr><td colspan="7">No horizon records were published.</td></tr>'}</tbody></table><footer><strong>Source:</strong> USDA NRCS Soil Data Access / SSURGO. This report presents the dominant component and representative horizon values for the mapped soil unit at one selected coordinate. Map units can contain multiple soils and properties vary within them. This screening report does not replace an on-site investigation for agricultural, engineering, environmental, or legal decisions.</footer></body></html>`;
    const url=URL.createObjectURL(new Blob([report],{type:"text/html;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=`${useCase.toLowerCase()}-soil-survey-${point[1].toFixed(5)}-${point[0].toFixed(5)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  useEffect(()=>{
    let disposed=false;
    Promise.all([import("maplibre-gl"),import("maplibre-contour")]).then(([maplibre,contourModule])=>{
      if(disposed||!container.current)return;
      try{
        const {Map,NavigationControl,ScaleControl,AttributionControl,setWorkerUrl}=maplibre;
        setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
        const contourDem=new contourModule.default.DemSource({url:"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",encoding:"terrarium",maxzoom:15,worker:true,cacheSize:120,timeoutMs:10_000});
        contourDem.setupMaplibre(maplibre);
        const m=new Map({container:container.current,center:[-112.112,36.106],zoom:10.5,pitch:55,bearing:-28,maxZoom:18,maxPitch:75,centerClampedToGround:true,aroundCenter:true,attributionControl:false,canvasContextAttributes:{antialias:true},style:{version:8,projection:{type:"mercator"},sources:{
          satellite:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"},
          aerial:{type:"raster",tiles:["https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512%2C512&format=png32&transparent=true&f=image"],tileSize:512,minzoom:12,maxzoom:19,bounds:[-125,24,-66,50],attribution:'High-resolution U.S. aerial imagery: <a href="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer">USGS, USDA, The National Map</a>'},
          topo:{type:"raster",tiles:["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:16,attribution:"Topography: USGS (United States)"},
          terrain:{type:"raster-dem",url:"https://tiles.mapterhorn.com/tilejson.json",attribution:'Elevation: <a href="https://mapterhorn.com/attribution/">Mapterhorn and source contributors</a>'},
          hillshade:{type:"raster-dem",url:"https://tiles.mapterhorn.com/tilejson.json"},
          contours:{type:"vector",tiles:[contourDem.contourProtocolUrl({multiplier:1,thresholds:{8:[200,1000],9:[100,500],11:[50,250],13:[20,100],15:[10,50]},contourLayer:"contours",elevationKey:"ele",levelKey:"level",extent:4096,buffer:1})],maxzoom:15},
          geology:{type:"raster",tiles:[`${window.location.origin}/api/tiles/{z}/{x}/{y}`],tileSize:256,maxzoom:14,attribution:'<a href="https://macrostrat.org">Macrostrat</a> & original survey authors · CC BY 4.0'},
          soilSurvey:{type:"raster",tiles:["https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?service=WMS&version=1.1.1&request=GetMap&layers=mapunitpoly&styles=&format=image/png&transparent=true&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256"],tileSize:256,minzoom:5,maxzoom:17,bounds:[-180,17,-65,72],attribution:'Soil map units: <a href="https://sdmdataaccess.nrcs.usda.gov/">USDA NRCS Soil Data Access</a>'},
          faults:{type:"raster",tiles:["https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:11,attribution:"Faults: USGS Quaternary Fault and Fold Database"},
          openfreemap:{type:"vector",url:"https://tiles.openfreemap.org/planet",attribution:'<a href="https://openfreemap.org">OpenFreeMap</a> · © OpenStreetMap contributors'},
          selection:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
        },layers:[
          {id:"space",type:"background",paint:{"background-color":"#06111d"}},
          {id:"satellite",type:"raster",source:"satellite",paint:{"raster-saturation":0.08,"raster-contrast":0.08,"raster-brightness-min":0,"raster-brightness-max":1,"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"aerial",type:"raster",source:"aerial",minzoom:12,layout:{visibility:"none"},paint:{"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"topo",type:"raster",source:"topo",layout:{visibility:"none"},paint:{"raster-contrast":0.02,"raster-brightness-max":0.98,"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"terrain-material",type:"color-relief",source:"hillshade",paint:{"color-relief-color":["interpolate",["linear"],["elevation"],-500,"#264d59",0,"#486e68",250,"#71836a",750,"#9a9868",1500,"#b48b64",2500,"#b67e60",3500,"#c9b89a",4500,"#e2ded0",6000,"#f5f5f1"],"color-relief-opacity":0,"resampling":"linear"}},
          {id:"terrain-shade",type:"hillshade",source:"hillshade",minzoom:5,paint:{"hillshade-method":"multidirectional","hillshade-illumination-anchor":"map","hillshade-illumination-direction":315,"hillshade-illumination-altitude":45,"hillshade-shadow-color":"#15252d","hillshade-highlight-color":"#f7f0db","hillshade-accent-color":"#52656a","hillshade-exaggeration":["interpolate",["linear"],["zoom"],5,0.28,11,0.2,15,0.08,18,0.03]}},
          {id:"geology",type:"raster",source:"geology",layout:{visibility:"none"},paint:{"raster-opacity":0.76,"raster-fade-duration":180}},
          {id:"soil-survey",type:"raster",source:"soilSurvey",minzoom:5,layout:{visibility:"none"},paint:{"raster-opacity":0.82,"raster-fade-duration":180,"raster-resampling":"linear"}},
          {id:"terrain-contours",type:"line",source:"contours","source-layer":"contours",minzoom:8,layout:{visibility:"none","line-cap":"round","line-join":"round"},paint:{"line-color":"#f5edcf","line-opacity":["interpolate",["linear"],["zoom"],8,0.08,10,0.18,12,0.32,15,0.44],"line-width":["interpolate",["linear"],["zoom"],8,["match",["get","level"],1,0.55,0.25],15,["match",["get","level"],1,1.15,0.65]]}},
          {id:"faults",type:"raster",source:"faults",layout:{visibility:"none"}},
          {id:"country-border-casing",type:"line",source:"openfreemap","source-layer":"boundary",maxzoom:12,filter:["==",["get","admin_level"],2],paint:{"line-color":"#142f38","line-opacity":0.8,"line-width":["interpolate",["linear"],["zoom"],0,1.8,6,3,12,4]}},
          {id:"country-borders",type:"line",source:"openfreemap","source-layer":"boundary",maxzoom:12,filter:["==",["get","admin_level"],2],paint:{"line-color":"#ffe08a","line-opacity":0.95,"line-width":["interpolate",["linear"],["zoom"],0,0.7,6,1.4,12,2]}},
          {id:"3d-buildings",type:"fill-extrusion",source:"openfreemap","source-layer":"building",minzoom:14,layout:{visibility:"none"},paint:{
            "fill-extrusion-color":"#b8c5c8",
            "fill-extrusion-height":["get","render_height"],
            "fill-extrusion-base":["get","render_min_height"],"fill-extrusion-opacity":0.9,"fill-extrusion-vertical-gradient":true}},
          {id:"selection-halo",type:"circle",source:"selection",paint:{"circle-radius":20,"circle-color":"rgba(255,189,74,0.2)","circle-stroke-color":"#ffbd4a","circle-stroke-width":3,"circle-pitch-alignment":"map"}},
          {id:"selection-core",type:"circle",source:"selection",paint:{"circle-radius":4,"circle-color":"#fff","circle-stroke-color":"#0b3340","circle-stroke-width":2,"circle-pitch-alignment":"map"}},
        ],terrain:{source:"terrain",exaggeration:1},sky:{"sky-color":"#8fb9c7","horizon-color":"#dce9e6","fog-color":"#d7e2de","fog-ground-blend":0.18,"horizon-fog-blend":0.72,"sky-horizon-blend":0.84,"atmosphere-blend":0.32}}});
        map.current=m;m.addControl(new NavigationControl({visualizePitch:true}),"top-right");m.addControl(new ScaleControl(),"bottom-left");m.addControl(new AttributionControl({compact:true}),"bottom-right");
        m.setCenterClampedToGround(true);
        m.on("load",()=>{m.setSourceTileLodParams(6,5,"satellite");m.setSourceTileLodParams(6,3,"aerial");m.setSourceTileLodParams(6,4,"terrain");m.setSourceTileLodParams(6,4,"hillshade");setReady(true);});m.on("move",()=>{const z=m.getZoom();setZoom(z);if(z<=GLOBE_ENTER_ZOOM)terrainRevealDone.current=false;setMode(current=>z<=GLOBE_ENTER_ZOOM?"GLOBE":z>=TERRAIN_ENTER_ZOOM?"TERRAIN":current);});
        m.on("zoomend",()=>{const z=m.getZoom();if(!terrainRevealDone.current&&z>=9&&m.getPitch()<50){terrainRevealDone.current=true;m.easeTo({pitch:55,bearing:-22,duration:900});}});
        m.on("moveend",()=>m.setCenterClampedToGround(true));
        m.on("idle",()=>setSceneLoading(false));
        m.on("click",e=>{
          if(!selectingRef.current)return;
          m.stop();
          const location=e.lngLat.wrap();
          if(m.getZoom()<12){
            terrainRevealDone.current=true;
            m.easeTo({center:location,zoom:13,pitch:45,duration:900});
            return;
          }
          const hits=m.queryRenderedFeatures(e.point,{layers:["3d-buildings"]});
          void inspectGround(location.lng,location.lat,hits.length?buildingFromFeature(hits[0]):null);
        });
        m.on("error",e=>{if(e.error){console.error("Geo Graph map source error",e.error);setMapError("One map source could not load. The other layers remain available.");}});
      }catch{setMapError("The 3D globe could not start. Reload in a browser with WebGL enabled.");}
    }).catch(()=>setMapError("The map renderer could not load. Please reload the page."));
    return()=>{disposed=true;request.current?.abort();searchRequest.current?.abort();map.current?.remove();map.current=null;};
  },[inspectGround]);

  useEffect(()=>{const m=map.current;if(!m||!ready)return;const terrainActive=mode==="TERRAIN";const showUnderlay=terrainActive&&surfaceMode!=="Bare Earth";const underlayOpacity=surfaceMode==="Natural"?1:surfaceMode==="Geology"?0.42:0.5;if(terrainActive){m.setProjection({type:"mercator"});m.setTerrain({source:"terrain",exaggeration:1});}else{m.setTerrain(null);m.setProjection({type:"globe"});}m.setLayoutProperty("satellite","visibility",!terrainActive||showUnderlay&&base==="satellite"?"visible":"none");m.setLayoutProperty("aerial","visibility",showUnderlay&&base==="satellite"?"visible":"none");m.setLayoutProperty("topo","visibility",showUnderlay&&base==="topo"?"visible":"none");m.setPaintProperty("satellite","raster-opacity",terrainActive?underlayOpacity:1);m.setPaintProperty("aerial","raster-opacity",underlayOpacity);m.setPaintProperty("satellite","raster-saturation",terrainActive&&surfaceMode!=="Natural"?-0.2:0.08);m.setPaintProperty("topo","raster-opacity",underlayOpacity);m.setLayoutProperty("terrain-material","visibility",terrainActive?"visible":"none");m.setPaintProperty("terrain-material","color-relief-opacity",surfaceMode==="Natural"?0:surfaceMode==="Bare Earth"?0.96:surfaceMode==="Geology"?0.1:0.07);m.setLayoutProperty("terrain-shade","visibility",terrainActive?"visible":"none");m.setPaintProperty("terrain-shade","hillshade-exaggeration",surfaceMode==="Bare Earth"?0.5:["interpolate",["linear"],["zoom"],5,0.28,11,0.2,15,0.08,18,0.03]);m.setPaintProperty("terrain-contours","line-color",surfaceMode==="Bare Earth"?"#263f42":"#f5edcf");m.setLayoutProperty("terrain-contours","visibility",terrainActive&&contours?"visible":"none");m.setLayoutProperty("geology","visibility",terrainActive&&surfaceMode==="Geology"?"visible":"none");m.setLayoutProperty("soil-survey","visibility",terrainActive&&surfaceMode==="Soil"?"visible":"none");m.setLayoutProperty("faults","visibility",terrainActive&&faults?"visible":"none");m.setLayoutProperty("country-border-casing","visibility",borders?"visible":"none");m.setLayoutProperty("country-borders","visibility",borders?"visible":"none");m.setLayoutProperty("3d-buildings","visibility",terrainActive&&buildings?"visible":"none");m.setCenterClampedToGround(true);},[ready,mode,surfaceMode,base,contours,faults,borders,buildings]);

  useEffect(()=>{
    const m=map.current;
    if(!m||!ready||!pbrCanRender)return;
    let disposed=false;
    let layer:{id:string;refresh:()=>void}|null=null;
    setPbrStatus("Loading material study");
    import("./pbrTerrainLayer").then(({createPbrTerrainLayer})=>{
      if(disposed)return;
      const study=createPbrTerrainLayer(m,status=>{if(!disposed)setPbrStatus(status);});
      m.addLayer(study,"selection-halo");
      layer=study;
      m.on("idle",study.refresh);
    }).catch(()=>{if(!disposed)setPbrStatus("Material renderer unavailable");});
    return()=>{
      disposed=true;
      if(layer){m.off("idle",layer.refresh);if(m.getLayer(layer.id))m.removeLayer(layer.id);}
    };
  },[ready,pbrCanRender]);

  function togglePbrStudy(){
    const next=!pbrEnabled;
    setPbrEnabled(next);
    if(!next)return;
    setSurfaceMode("Natural");setBase("satellite");
    const m=map.current;
    if(m&&mode==="TERRAIN"&&m.getZoom()<15){m.easeTo({zoom:15.5,pitch:55,duration:850});}
  }

  function goToView(view:typeof VIEWS[number]){
    const m=map.current;if(!m||!ready)return;
    searchRequest.current?.abort();setSearching(false);setPlaces([]);setSearchError("");
    terrainRevealDone.current=view.zoom>=9;
    m.stop();setSceneLoading(true);
    if(view===VIEWS[0]){
      m.easeTo({center:m.getCenter().wrap(),zoom:view.zoom,pitch:0,bearing:0,duration:1200});
    }else{
      // A long surface-level pan can pass through terrain before elevation tiles arrive.
      m.jumpTo({center:view.point,zoom:view.zoom,pitch:Math.min(view.pitch,55),bearing:view.bearing});
    }
    clearSelection();
  }
  function closeTerrain(){
    const m=map.current;if(!m||!ready)return;
    terrainRevealDone.current=true;m.stop();setSceneLoading(true);
    m.setProjection({type:"mercator"});m.jumpTo({center:m.getCenter().wrap(),zoom:Math.max(m.getZoom(),10.5),pitch:55,bearing:m.getBearing()});setMode("TERRAIN");
  }
  function selectCenter(){const m=map.current;if(!m||m.getZoom()<12)return;const center=m.getCenter().wrap();void inspectGround(center.lng,center.lat);}
  function returnToSelection(){const m=map.current;if(!m||!point)return;m.setCenterClampedToGround(true);m.easeTo({center:point,duration:900,essential:true});}
  async function search(event:React.FormEvent){event.preventDefault();if(!query.trim())return;searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;setSearching(false);setSearchError("");setPlaces([]);const coords=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(coords){const lat=Number(coords[1]),lng=Number(coords[2]);if(Math.abs(lat)>85||Math.abs(lng)>180){setSearchError("Use latitude −85 to 85 and longitude −180 to 180.");return;}goToView({name:"Coordinates",icon:"",point:[lng,lat],zoom:16.3,pitch:58,bearing:-22});return;}setSearching(true);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});if(!response.ok)throw new Error("Place search is unavailable. Enter latitude, longitude instead.");const data=await response.json() as Place[];if(controller.signal.aborted)return;setPlaces(data);if(!data.length)setSearchError("No places found. Try a nearby city or latitude, longitude.");}catch(cause){if(controller.signal.aborted)return;setSearchError(cause instanceof Error?cause.message:"Search failed.");}finally{if(!controller.signal.aborted)setSearching(false);}}
  const unit=result?.units[selected];
  const activeCase=USE_CASE_COPY[useCase];
  const activeSurface=SURFACE_COPY[surfaceMode];
  const soilValue=(value:unknown, fallback="Not available")=>value==null||value===""?fallback:String(value);
  const textureParts=soil?[{label:"Sand",value:soil.sandPercent,color:"#dcae63"},{label:"Silt",value:soil.siltPercent,color:"#a8b978"},{label:"Clay",value:soil.clayPercent,color:"#96705c"}].filter(part=>typeof part.value==="number"&&part.value>=0):[];
  const textureTotal=textureParts.reduce((sum,part)=>sum+(part.value as number),0);
  const kpis=[
    {label:"SURVEY STATUS",value:soilLoading?"Reading…":soil?"Mapped unit":soilError?"Unavailable":point?"No coverage":"Awaiting point",tone:soil?"good":"neutral"},
    {label:"MAP UNIT",value:soil?.mapUnitSymbol||"—",tone:"neutral"},
    {label:"SLOPE",value:soil?.slopePercent!=null?`${soil.slopePercent}%`:"—",tone:"neutral"},
    {label:"pH",value:soil?.ph!=null?String(soil.ph):"—",tone:"neutral"},
  ];
  const surfaceHorizon=soil?.horizons?.[0];
  const useCaseFacts:Record<UseCase,Array<[string,string]>>={
    Overview:[["Map unit",soil?`${soil.mapUnitSymbol} · ${soil.mapUnitName}`:"—"],["Dominant component",soil?.componentName||"—"],["Representative slope",soil?.slopePercent!=null?`${soil.slopePercent}%`:"—"],["Drainage",soil?.drainageClass||"—"]],
    Agriculture:[["Capability class",soil?.nonIrrigatedCapabilityClass||"—"],["Surface organic matter",soil?.organicMatterPercent!=null?`${soil.organicMatterPercent}%`:"—"],["Surface pH (1:1 water)",soil?.ph!=null?String(soil.ph):"—"],["Profile water storage",soil?.profileAvailableWaterStorageMm!=null?`${soil.profileAvailableWaterStorageMm} mm`:"—"]],
    Water:[["Hydrologic group",soil?.hydrologicGroup||"—"],["Runoff class",soil?.runoffClass||"—"],["Flooding frequency",soil?.floodingFrequency||"—"],["Ponding frequency",soil?.pondingFrequency||"—"],["Hydric rating",soil?.hydricRating||"—"]],
    Construction:[["Restriction",soil?.restrictionKind?`${soil.restrictionKind}${soil.restrictionDepthCm!=null?` · ${soil.restrictionDepthCm} cm`:""}`:"—"],["Concrete corrosion",soil?.concreteCorrosion||"—"],["Steel corrosion",soil?.steelCorrosion||"—"],["Frost action",soil?.frostAction||"—"],["Surface plasticity index",surfaceHorizon?.plasticityIndex!=null?String(surfaceHorizon.plasticityIndex):"—"]],
    Environment:[["Hydric condition",soil?.hydricCondition||soil?.hydricRating||"—"],["Surface CEC",surfaceHorizon?.cationExchangeCapacity!=null?`${surfaceHorizon.cationExchangeCapacity} cmol(+)/kg`:"—"],["Electrical conductivity",surfaceHorizon?.electricalConductivity!=null?`${surfaceHorizon.electricalConductivity} dS/m`:"—"],["Erosion K factor",surfaceHorizon?.erosionKFactor!=null?String(surfaceHorizon.erosionKFactor):"—"],["Rock fragments",surfaceHorizon?.rockFragmentsPercent!=null?`${surfaceHorizon.rockFragmentsPercent}%`:"—"]],
  };
  function horizonMetrics(horizon:Horizon):Array<[string,string]>{
    const metric=(value:number|null,units="")=>value==null?"Not rated":`${value}${units}`;
    switch(useCase){
      case "Agriculture":return [["pH",metric(horizon.ph)],["Organic matter",metric(horizon.organicMatterPercent,"%")],["Available water",metric(horizon.availableWaterCapacity," cm/cm")]];
      case "Water":return [["Available water",metric(horizon.availableWaterCapacity," cm/cm")],["Ksat",metric(horizon.saturatedHydraulicConductivity," µm/s")],["Clay",metric(horizon.clayPercent,"%")]];
      case "Construction":return [["Plasticity index",metric(horizon.plasticityIndex)],["Liquid limit",metric(horizon.liquidLimit)],["Bulk density",metric(horizon.bulkDensity," g/cm³")]];
      case "Environment":return [["Organic matter",metric(horizon.organicMatterPercent,"%")],["CEC",metric(horizon.cationExchangeCapacity," cmol(+)/kg")],["Conductivity",metric(horizon.electricalConductivity," dS/m")]];
      default:return [["pH",metric(horizon.ph)],["Available water",metric(horizon.availableWaterCapacity," cm/cm")],["Ksat",metric(horizon.saturatedHydraulicConductivity," µm/s")]];
    }
  }
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <main className="app-shell"><header><a className="brand" href="/" aria-label="Geo Graph home"><span className="brand-icon">◈</span><span>GEO GRAPH<small>Terrain intelligence</small></span></a><span className="header-note"><b>Survey workspace</b><small>Surface analysis console</small></span><span className="view-readout"><i className={ready?"online":""}/><b>{ready?"SYSTEM READY":"INITIALIZING"}</b><span>{mode} · Z{zoom.toFixed(1)}</span></span></header><div className="workspace"><aside>
    <section className="intro dashboard-intro"><div className="intro-heading"><div><p className="eyebrow">SOIL INTELLIGENCE</p><h1>Survey the ground with context.</h1></div><span className="status-dot" aria-label={ready?"Map ready":"Map loading"}/></div><p>Choose a workspace, then select ground to inspect soil, geology, and terrain at a precise location.</p><div className="kpi-grid">{kpis.map(kpi=><div className={`kpi-card ${kpi.tone}`} key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong></div>)}</div></section>
    <section className="location-panel"><form onSubmit={search}><label htmlFor="search">Find a place</label><div className="search-row"><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="City, landmark, or coordinates"/><button disabled={searching||!ready}>{searching?"…":"Go"}</button></div></form>{searchError&&<p role="alert" className="error">{searchError}</p>}{places.length>0&&<ul className="places">{places.map((place,index)=><li key={`${place.name}-${index}`}><button onClick={()=>goToView({name:place.name,icon:"",point:place.point,zoom:16.3,pitch:58,bearing:-24})}>{place.name}</button></li>)}</ul>}</section>
    <section className="use-case-panel"><div className="section-heading"><div><p className="eyebrow">WORKSPACE VIEW</p><h2>Use case</h2></div><span className="selection-count">{point?"1 point":"No point"}</span></div><div className="use-case-tabs" aria-label="Soil use case"><div className="use-case-tab-row">{USE_CASES.map(item=><button key={item} aria-pressed={useCase===item} onClick={()=>applyUseCase(item)}>{item}</button>)}</div></div><div className="use-case-summary"><p className="workspace-action">{useCase==="Overview"?"Natural imagery · clean terrain":useCase==="Agriculture"?"Soil boundaries · near-overhead view":useCase==="Water"?"Bare earth · elevation contours":useCase==="Construction"?"Geology · contours · mapped faults":"Natural imagery · elevation contours"}{mode==="GLOBE"?" · Applied when you zoom in":""}</p><strong>{activeCase.title}</strong><p>{activeCase.body}</p><div className="focus-fields">{activeCase.fields.map(field=><span key={field}>{field}</span>)}</div><dl className="use-case-facts">{useCaseFacts[useCase].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div><div className="workspace-tools"><button disabled={!ready} onClick={()=>{setSelectionMode(true);container.current?.scrollIntoView({behavior:"smooth",block:"start"});}}>Select a sample</button>{soil&&<button onClick={exportSoilReport}>Export {useCase.toLowerCase()} report</button>}</div><p className="interpretation-note">Screening context only. Confirm important decisions with an on-site investigation and the complete USDA survey.</p></section>
    <section className="display-panel"><p className="eyebrow">MAP DISPLAY</p><div className="terrain-status"><span className="layer-symbol terrain-symbol">{activeSurface.icon}</span><div><b>{activeSurface.title}</b><small>{activeSurface.body}</small></div></div><div className="surface-grid" aria-label="Terrain surface material">{SURFACE_MODES.map(item=><button key={item} aria-pressed={surfaceMode===item} onClick={()=>setSurfaceMode(item)}><span>{SURFACE_COPY[item].icon}</span>{item}</button>)}</div><div className="surface-legend"><div>{activeSurface.swatches.map((color,index)=><i key={color} style={{background:color}} aria-hidden="true" data-index={index}/>)}</div><span>{activeSurface.source}</span></div>{surfaceMode!=="Bare Earth"&&<div className="base-switch"><button aria-pressed={base==="satellite"} onClick={()=>setBase("satellite")}>Satellite underlay</button><button aria-pressed={base==="topo"} onClick={()=>setBase("topo")}>USGS topo · U.S.</button></div>}<div className="layer-grid"><button aria-pressed={contours} onClick={()=>setContours(!contours)}><span className="layer-symbol terrain-symbol">≋</span><b>Contours</b><small>Dynamic elevation</small></button><button aria-pressed={borders} onClick={()=>setBorders(!borders)}><span className="layer-symbol border-symbol">┄</span><b>Borders</b><small>Country boundaries</small></button><button aria-pressed={faults} onClick={()=>setFaults(!faults)}><span className="layer-symbol fault-symbol">⌁</span><b>Faults</b><small>U.S. mapped faults</small></button><button aria-pressed={buildings} onClick={()=>setBuildings(!buildings)}><span className="layer-symbol building-symbol">▥</span><b>Buildings</b><small>{buildings&&(mode==="GLOBE"||zoom<14)?"Zoom in to see":"Optional city detail"}</small></button><button className="pbr-option" aria-pressed={pbrEnabled} onClick={togglePbrStudy}><span className="layer-symbol">⬡</span><b>PBR material study</b><small>{pbrEnabled?(pbrCanRender?pbrStatus:"Natural imagery · zoom 15+"):"Close-up rock material · illustrative"}</small></button></div><p className="display-note">{mode==="GLOBE"?"Zoom in to reveal terrain and survey layers. Your settings are preserved.":"Terrain follows your zoom. Buildings appear at city scale."}</p></section>
    <section className="inspector" ref={inspector} tabIndex={-1} aria-label="Selected location details"><p className="eyebrow">SELECTED LOCATION</p>{!point?<div className="empty-state"><span className="select-icon">⌖</span><h2>Select the ground.</h2><p>Choose Select ground, then click a spot. At broad zoom levels, the first click moves closer so you can place the sample precisely.</p></div>:<><div className="selection-heading"><div><p className="coordinates">{point[1].toFixed(5)}, {point[0].toFixed(5)}</p><h2>{building?building.name:"Ground selection"}</h2></div><div className="selection-actions"><button className="mini-export" onClick={clearSelection}>Clear</button><span className="selected-badge">SELECTED</span>{soil&&<button className="mini-export" onClick={exportSoilReport}>Export</button>}</div></div>{building&&<article className="data-card building-card"><h3>Building</h3><dl className="fact-grid"><div><dt>Height</dt><dd>{building.height}</dd></div><div><dt>Levels</dt><dd>{building.levels}</dd></div></dl><p>{building.source}</p></article>}<article className="data-card soil-card"><div className="card-heading"><div><span className="card-icon">◫</span><h3>Soil survey</h3></div><span>USDA SSURGO</span></div>{soilLoading&&<p role="status" className="loading-line">Reading the soil profile…</p>}{soilError&&<p role="alert" className="error">{soilError} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{!soilLoading&&!soilError&&!soil&&<p>No detailed USDA soil polygon covers this point.</p>}{soil&&<><h4>{soil.mapUnitName}</h4><p className="muted-line">{soil.surveyAreaName} · {soil.mapUnitSymbol}</p><div className="soil-profile"><div className="profile-label"><span>Surface profile</span><strong>{soil.horizonName||"Not described"}</strong></div><div className="profile-track"><span className="profile-fill" style={{width:soil.horizonBottomCm!=null?`${Math.min(100,Math.max(12,soil.horizonBottomCm/2))}%`:"28%"}}/></div><small>{soil.horizonTopCm!=null?`${soil.horizonTopCm} cm` : "Top depth unavailable"} → {soil.horizonBottomCm!=null?`${soil.horizonBottomCm} cm` : "Bottom depth unavailable"}</small></div><dl className="fact-grid"><div><dt>Major component</dt><dd>{soilValue(soil.componentName)}{soil.componentPercent!=null?` · ${soil.componentPercent}%`:""}</dd></div><div><dt>Surface texture</dt><dd>{soilValue(soil.texture)}</dd></div><div><dt>Drainage</dt><dd>{soilValue(soil.drainageClass)}</dd></div><div><dt>Hydrologic group</dt><dd>{soilValue(soil.hydrologicGroup)}</dd></div><div><dt>Slope</dt><dd>{soil.slopePercent!=null?`${soil.slopePercent}%`:"Not rated"}</dd></div><div><dt>Organic matter</dt><dd>{soil.organicMatterPercent!=null?`${soil.organicMatterPercent}%`:"Not rated"}</dd></div><div><dt>pH</dt><dd>{soil.ph??"Not rated"}</dd></div><div><dt>Taxonomy</dt><dd>{soil.taxonomicSubgroup||soil.taxonomicOrder||"Not classified"}</dd></div></dl>{textureParts.length>0&&<div className="texture-profile"><div className="profile-label"><span>Texture fractions</span><strong>{textureTotal===100?"Reported total 100%":"Reported fractions"}</strong></div><div className="texture-track">{textureParts.map(part=><span key={part.label} title={`${part.label}: ${part.value}%`} style={{width:`${(part.value as number)/Math.max(textureTotal,1)*100}%`,background:part.color}}/>)}</div><div className="texture-legend">{textureParts.map(part=><span key={part.label}><i style={{background:part.color}}/>{part.label} {part.value}%</span>)}</div></div>}{soil.taxonomicSubgroup&&<p className="taxonomy">{soil.taxonomicOrder} · {soil.taxonomicSubgroup}</p>}<details><summary>Additional survey fields</summary><dl className="fact-grid compact"><div><dt>Sand</dt><dd>{soil.sandPercent!=null?`${soil.sandPercent}%`:"—"}</dd></div><div><dt>Silt</dt><dd>{soil.siltPercent!=null?`${soil.siltPercent}%`:"—"}</dd></div><div><dt>Clay</dt><dd>{soil.clayPercent!=null?`${soil.clayPercent}%`:"—"}</dd></div><div><dt>Map unit key</dt><dd>{soil.mapUnitKey}</dd></div><div><dt>Flooding</dt><dd>{soilValue(soil.floodingFrequency)}</dd></div><div><dt>Ponding</dt><dd>{soilValue(soil.pondingFrequency)}</dd></div><div><dt>Permeability</dt><dd>{soilValue(soil.permeability)}</dd></div><div><dt>Available water</dt><dd>{soil.availableWaterCapacity!=null?`${soil.availableWaterCapacity} cm/cm`:"—"}</dd></div></dl></details></>}</article><article className="data-card geology-card"><div className="card-heading"><div><span className="card-icon geology-symbol">◒</span><h3>Surface geology</h3></div><span>MACROSTRAT</span></div>{loading&&<p role="status" className="loading-line">Reading mapped geology…</p>}{error&&<p role="alert" className="error">{error} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{result&&!result.units.length&&<p>No published rock units were returned at this point.</p>}{unit&&<><label htmlFor="survey">Survey interpretation</label><select id="survey" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{result!.units.map((item,index)=><option key={item.map_id} value={index}>{item.name||"Unnamed unit"}</option>)}</select><h4><span className="swatch" style={{background:/^#[0-9a-f]{6}$/i.test(unit.color)?unit.color:"#aaa"}}/>{unit.name}</h4><dl className="fact-grid"><div><dt>Rock type</dt><dd>{unit.lith?.replace(/[{}]/g," ")||"Not specified"}</dd></div><div><dt>Geologic age</dt><dd>{unit.best_int_name||[unit.b_int_name,unit.t_int_name].filter(Boolean).join(" – ")||"Not specified"}</dd></div></dl>{unit.descrip&&<p>{unit.descrip}</p>}<details><summary>Survey source</summary><p>{result!.refs[String(unit.source_id)]||"See the Macrostrat source record."}</p></details></>}</article></>}</section>
    {soil&&soil.horizons.length>0&&<section className="horizon-dashboard"><div className="section-heading"><div><p className="eyebrow">SOIL PROFILE</p><h2>{useCase} depth profile</h2></div><span className="selection-count">{soil.horizons.length} layers</span></div><div className="horizon-list">{soil.horizons.map((horizon,index)=><article key={horizon.key}><div className="horizon-swatch" style={{opacity:Math.max(.35,1-index*.1)}}/><div><strong>{horizon.name||`Layer ${index+1}`}</strong><span>{horizon.topCm??"?"}–{horizon.bottomCm??"?"} cm · {horizon.texture||"Texture not rated"}</span></div><dl>{horizonMetrics(horizon).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</div></section>}
    {soil&&point&&<section className="report-export"><div><p className="eyebrow">FIELD REPORT</p><h2>Take this survey with you.</h2><p>Export the selected soil unit and full dominant-component profile as a print-ready report, or save it as a PDF from your browser.</p></div><button className="export-button" onClick={exportSoilReport}>⇩ Export soil report</button></section>}
    <section className="coverage"><p>Soils: USDA NRCS Soil Data Access / SSURGO. Terrain: Mapterhorn and source contributors; contours: Mapzen and source contributors. U.S. aerial imagery: USGS, USDA, The National Map. Geology: Macrostrat and original survey authors. Coverage and detail vary.</p></section>
  </aside><div className="map-shell"><div ref={container} className="map" aria-label="Interactive 3D terrain survey"/>{!ready&&!mapError&&<div className="map-message" role="status">Loading 3D terrain…</div>}{sceneLoading&&<div className="scene-loading" role="status">Loading elevation and imagery…</div>}{mapError&&<div className="map-message error" role="alert">{mapError}<button onClick={()=>setMapError("")}>×</button></div>}<div className="mode-chip"><span>{mode} · {mode==="GLOBE"?"GLOBAL":surfaceMode.toUpperCase()}</span><strong>{mode==="GLOBE"?"Global overview":"Orbit the terrain and inspect the ground"}</strong></div><div className="camera-tools"><button disabled={!ready} className="primary-camera" aria-pressed={selecting} onClick={()=>setSelectionMode(!selecting)}>{selecting?"× Cancel selection":"⌖ Select ground"}</button>{selecting&&zoom>=12&&<button onClick={selectCenter}>Inspect map center</button>}{point&&<button onClick={returnToSelection}>↩ Selection</button>}<button disabled={!ready} onClick={()=>goToView(VIEWS[0])}>◎ Globe</button><button disabled={!ready} onClick={closeTerrain}>◢ 3D view</button></div>{point&&<button className="selection-summary" onClick={()=>{inspector.current?.scrollIntoView({behavior:"smooth",block:"start"});inspector.current?.focus({preventScroll:true});}}><span>{soilLoading?"Reading soil survey…":soil?soil.mapUnitName:soilError?"Soil lookup unavailable":"No mapped soil at this point"}</span><strong>View details ↓</strong></button>}<div className={`map-help${selecting?" selecting":""}`} role="status">{selecting?(zoom<12?"Click an area to move closer, then choose the exact ground point. Esc cancels.":"Click the ground to inspect it, or inspect the map center. Esc cancels."):"Drag to explore · Right-drag to orbit · Select ground to take a sample"}</div></div></div></main>;
}
