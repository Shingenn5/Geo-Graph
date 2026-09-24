"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as GLMap, MapGeoJSONFeature } from "maplibre-gl";
import { buildSurveyReportHtml, createSurveySelection, serializeSurveyGeoJSON, serializeSurveyJSON } from "../lib/survey/selection";
import type { EvidenceStatus } from "../lib/survey/types";
import { createRectangleSelection } from "../lib/selection/geometry";
import type { RectangleSelection } from "../lib/selection/geometry";
import { collectAreaEvidence } from "../lib/selection/area-evidence";
import type { AreaEvidence, PointLookup } from "../lib/selection/area-evidence";
import { CORE_MANIFEST } from "../lib/core/manifest";
import { LAS_LIMITS, parseLas } from "../lib/logs/las";
import { BoundedCache, cachedJson, coordinateQuery } from "../lib/viewer/cache";
import { CLEAR_IMAGERY_URL, OVERTURE_BUILDINGS } from "../lib/viewer/sources";
import { hasLayerCoverage } from "../lib/viewer/transition";
import { recordMetric } from "../lib/viewer/metrics";
import type { ParsedWellLog } from "../lib/logs/las";

type Unit = { map_id:number; source_id:number; name:string; strat_name:string; lith:string; descrip:string; color:string; best_int_name:string; t_int_name:string; b_int_name:string };
type GeologyResult = { units:Unit[]; refs:Record<string,string> };
type Place = { name:string; point:[number,number] };
type MapPlace = { state:string|null; country:string|null };
type Building = { name:string; height:string; levels:string; source:string };
type Horizon = { key:string; name:string|null; topCm:number|null; bottomCm:number|null; texture:string|null; sandPercent:number|null; siltPercent:number|null; clayPercent:number|null; rockFragmentsPercent:number|null; organicMatterPercent:number|null; ph:number|null; availableWaterCapacity:number|null; saturatedHydraulicConductivity:number|null; bulkDensity:number|null; erosionKFactor:number|null; liquidLimit:number|null; plasticityIndex:number|null; cationExchangeCapacity:number|null; electricalConductivity:number|null };
type Soil = { mapUnitKey:string; mapUnitSymbol:string; mapUnitName:string; surveyAreaSymbol:string; surveyAreaName:string; surveyMatchCount:number|null; componentName:string|null; componentKind:string|null; majorComponent:boolean; componentPercent:number|null; taxonomicOrder:string|null; taxonomicSubgroup:string|null; taxonomicClass:string|null; drainageClass:string|null; hydrologicGroup:string|null; slopeLowPercent:number|null; slopePercent:number|null; slopeHighPercent:number|null; runoffClass:string|null; hydricRating:string|null; hydricCondition:string|null; floodingFrequency:string|null; pondingFrequency:string|null; concreteCorrosion:string|null; steelCorrosion:string|null; frostAction:string|null; nonIrrigatedCapabilityClass:string|null; irrigatedCapabilityClass:string|null; restrictionKind:string|null; restrictionDepthCm:number|null; profileAvailableWaterStorageMm:number|null; horizonName:string|null; horizonTopCm:number|null; horizonBottomCm:number|null; texture:string|null; sandPercent:number|null; siltPercent:number|null; clayPercent:number|null; organicMatterPercent:number|null; ph:number|null; availableWaterCapacity:number|null; permeability:string|null; horizons:Horizon[] };
type SoilResult = { soil:Soil|null; source?:string };
type NearbyWell = { id:string; name:string; api:string|null; operator:string|null; type:string|null; status:string|null; field:string|null; county:string|null; latitude:number; longitude:number; distanceKm:number };
type WellsResult = { wells:NearbyWell[]; source:{ name:string; organization:string; datasetUrl:string; attribution:string }; coverage:{ status:"ok"|"no_data"; radiusKm:number; count:number; truncated:boolean; sourceLimitReached:boolean } };
type SourceProvenance = {status:string;generatedAt:string;imagery:{status:string;service:string;scene:{rasterName:string|null;acquisitionDate:string|null;resolution:number|null;resolutionUnits:string|null;agency:string|null}|null};elevation:{status:string;service:string;result:{elevation:number|null;elevationUnits:string|null;resolution:number|null;resolutionUnits:string|null;verticalDatum:string|null}|null};terrainTiles:{status:string;activeUpstreamSource:string|null;sourceResolution:number|null;verticalDatum:string|null}};
type ViewMode = "GLOBE" | "TERRAIN";
type UseCase = "Overview" | "Wellsite" | "Agriculture" | "Water" | "Construction" | "Environment";
type SurfaceMode = "Natural" | "Bare Earth" | "Geology" | "Soil";
type BaseImagery = "satellite" | "clarity" | "topo";

const GLOBE_ENTER_ZOOM=4.5;
const TERRAIN_ENTER_ZOOM=5.25;

const USE_CASES:UseCase[]=["Overview","Wellsite","Agriculture","Water","Construction","Environment"];
const SURFACE_MODES:SurfaceMode[]=["Natural","Bare Earth","Geology","Soil"];
const SURFACE_COPY:Record<SurfaceMode,{icon:string;title:string;body:string;source:string;swatches:string[]}>= {
  Natural:{icon:"◈",title:"Natural surface",body:"Full-color imagery over detailed terrain with subtle relief.",source:"Esri imagery + Mapterhorn elevation",swatches:["#6f8060","#a48a67","#d3c4a2"]},
  "Bare Earth":{icon:"△",title:"Bare-earth elevation",body:"A hypsometric elevation material with terrain form emphasized above imagery.",source:"Mapterhorn elevation",swatches:["#486e68","#9a9868","#b67e60","#e2ded0"]},
  Geology:{icon:"◒",title:"Surface geology",body:"Published rock-unit mapping draped across the three-dimensional surface.",source:"Macrostrat + survey authors",swatches:["#bd6a75","#d49b62","#7e9d75"]},
  Soil:{icon:"▦",title:"Soil map units",body:"USDA SSURGO map-unit polygons over a subdued terrain underlay. U.S. coverage only.",source:"USDA NRCS Soil Data Access",swatches:["#d9c899","#aa9368","#7f6953"]},
};
const USE_CASE_COPY:Record<UseCase,{title:string;body:string;fields:string[]}>= {
  Overview:{title:"Survey overview",body:"A quick read of the mapped soil unit and the location context.",fields:["Map unit","Texture","Drainage","Slope"]},
  Wellsite:{title:"Wellsite review",body:"Inspect terrain and mapped geology around a selected location, then compare nearby public well records when available.",fields:["Surface geology","Mapped faults","Nearby wells","Source records"]},
  Agriculture:{title:"Agriculture lens",body:"Use texture, organic matter, pH, and water behavior as a starting point for field planning.",fields:["Texture","Organic matter","pH","Hydrologic group"]},
  Water:{title:"Water lens",body:"Review drainage and hydrologic group before planning runoff, infiltration, or wetland work.",fields:["Drainage","Hydrologic group","Flooding","Ponding"]},
  Construction:{title:"Construction lens",body:"Check mapped slope, depth, texture, and drainage before a site visit or preliminary design.",fields:["Slope","Surface horizon","Texture","Drainage"]},
  Environment:{title:"Environment lens",body:"Keep the mapped taxonomy and surface properties together for restoration and habitat context.",fields:["Taxonomy","Organic matter","pH","Surface horizon"]},
};

const VIEWS = [
  { name:"Earth", icon:"◎", point:[-18,24] as [number,number], zoom:1.65, pitch:0, bearing:0 },
];
// Public UGRC surface location for a well pad near Roosevelt, Utah. The live service remains authoritative.
const UINTA_PILOT_POINT:[number,number]=[-109.99532020981788,40.31458853576911];

function buildingFromFeature(feature:MapGeoJSONFeature):Building {
  const p=feature.properties??{};
  const rawHeight=p.render_height==null&&p.height==null?NaN:Number(p.render_height??p.height), levels=p.levels==null&&p.num_floors==null?NaN:Number(p.levels??p.num_floors);
  const fallback=Number.isFinite(levels)?levels*3.2:6;
  return {name:String(p.name||p["@name"]||p.class||"Building"),height:`${Math.round(Number.isFinite(rawHeight)?rawHeight:fallback)} m${Number.isFinite(rawHeight)?"":" estimated"}`,levels:Number.isFinite(levels)?String(levels):"Not mapped",source:feature.source==="overture"?"Overture Maps / source contributors (inspection tiles)":"OpenStreetMap via OpenFreeMap"};
}

function escapeHtml(value:unknown){
  return String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
}

export default function GeoExplorer(){
  const coverage=useRef(new Map<string,string>());
  const viewKey=(m:GLMap)=>`${m.getCenter().lng.toFixed(5)},${m.getCenter().lat.toFixed(5)},${m.getZoom().toFixed(3)},${m.getBearing().toFixed(1)},${m.getPitch().toFixed(1)}`;
  const lookupCache=useRef(new BoundedCache<unknown>(48));
  const [layerStatus,setLayerStatus]=useState("");
  const [displaySurface,setDisplaySurface]=useState<SurfaceMode>("Natural"),[displayBase,setDisplayBase]=useState<BaseImagery>("satellite");
  const container=useRef<HTMLDivElement>(null), map=useRef<GLMap|null>(null), request=useRef<AbortController|null>(null), searchRequest=useRef<AbortController|null>(null), inspector=useRef<HTMLElement|null>(null), selectingRef=useRef(false), areaModeRef=useRef(false), areaFirst=useRef<[number,number]|null>(null), terrainRevealDone=useRef(true);
  const [ready,setReady]=useState(false),[mode,setMode]=useState<ViewMode>("TERRAIN"),[zoom,setZoom]=useState(10.5),[surfaceMode,setSurfaceMode]=useState<SurfaceMode>("Natural"),[base,setBase]=useState<BaseImagery>("satellite"),[contours,setContours]=useState(false),[faults,setFaults]=useState(false),[borders,setBorders]=useState(true),[buildings,setBuildings]=useState(false);
  const overtureEnabledRef=useRef(false);
  const [overtureEnabled,setOvertureEnabled]=useState(false),[buildingStatus,setBuildingStatus]=useState("");
  const [aerialEnabled,setAerialEnabled]=useState(false);
  const [query,setQuery]=useState(""),[places,setPlaces]=useState<Place[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState("");
  const [mapCenter,setMapCenter]=useState<[number,number]>([-112.112,36.106]),[mapPlace,setMapPlace]=useState<MapPlace|null>(null);
  const [point,setPoint]=useState<[number,number]|null>(null),[terrainElevation,setTerrainElevation]=useState<number|null>(null),[result,setResult]=useState<GeologyResult|null>(null),[selected,setSelected]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(""),[mapError,setMapError]=useState(""),[building,setBuilding]=useState<Building|null>(null),[sceneLoading,setSceneLoading]=useState(false);
  const [soil,setSoil]=useState<Soil|null>(null),[soilLoading,setSoilLoading]=useState(false),[soilError,setSoilError]=useState("");
  const [wells,setWells]=useState<WellsResult|null>(null),[wellsLoading,setWellsLoading]=useState(false),[wellsError,setWellsError]=useState("");
  const [provenance,setProvenance]=useState<SourceProvenance|null>(null),[provenanceLoading,setProvenanceLoading]=useState(false),[provenanceError,setProvenanceError]=useState("");
  const [useCase,setUseCase]=useState<UseCase>("Overview"),useCaseRef=useRef<UseCase>("Overview");
  const [selecting,setSelecting]=useState(false);
  const [areaMode,setAreaMode]=useState(false),[areaAwaiting,setAreaAwaiting]=useState(false),[area,setArea]=useState<RectangleSelection|null>(null),[areaError,setAreaError]=useState("");
  const [areaEvidence,setAreaEvidence]=useState<AreaEvidence|null>(null),[areaEvidenceLoading,setAreaEvidenceLoading]=useState(false),[areaEvidenceError,setAreaEvidenceError]=useState("");
  const [localLog,setLocalLog]=useState<ParsedWellLog|null>(null),[logName,setLogName]=useState(""),[logError,setLogError]=useState(""),[logCurve,setLogCurve]=useState(1);
  const [coreObservationOpen,setCoreObservationOpen]=useState(false);
  const [pbrEnabled,setPbrEnabled]=useState(false),[pbrStatus,setPbrStatus]=useState("Ready at close zoom");
  const pbrCanRender=pbrEnabled&&mode==="TERRAIN"&&surfaceMode==="Natural"&&base==="satellite"&&zoom>=15;
  useEffect(()=>{
    if(!sceneLoading)return;
    // A failing optional tile can keep MapLibre from emitting idle indefinitely.
    const timeout=window.setTimeout(()=>setSceneLoading(false),8000);
    return()=>window.clearTimeout(timeout);
  },[sceneLoading]);
  const setSelectionMode=useCallback((active:boolean)=>{
    selectingRef.current=active;setSelecting(active);
    if(!active){areaFirst.current=null;setAreaAwaiting(false);}
    if(map.current)map.current.getCanvas().style.cursor=active?"crosshair":"";
  },[]);
  function beginSelection(kind:"point"|"area"){
    areaModeRef.current=kind==="area";setAreaMode(kind==="area");areaFirst.current=null;setAreaAwaiting(false);setAreaError("");setSelectionMode(true);
  }
  useEffect(()=>{
    const cancel=(event:KeyboardEvent)=>{if(event.key==="Escape"){selectingRef.current=false;setSelecting(false);areaFirst.current=null;setAreaAwaiting(false);if(map.current)map.current.getCanvas().style.cursor="";}};
    window.addEventListener("keydown",cancel);
    return()=>window.removeEventListener("keydown",cancel);
  },[]);
  function applyUseCase(next:UseCase){
    useCaseRef.current=next;setUseCase(next);setBase("satellite");setWells(null);setWellsError("");setWellsLoading(next==="Wellsite"&&Boolean(point));
    const presets:Record<UseCase,{surface:SurfaceMode;contours:boolean;faults:boolean;pitch:number}>={
      Overview:{surface:"Natural",contours:false,faults:false,pitch:55},
      Wellsite:{surface:"Geology",contours:true,faults:true,pitch:55},
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
    setArea(null);setAreaError("");
    setAreaEvidence(null);setAreaEvidenceLoading(false);setAreaEvidenceError("");
    (map.current?.getSource("areaSelection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setPoint([lng,lat]);setTerrainElevation(null);setBuilding(selectedBuilding);setLoading(true);setSoilLoading(true);setError("");setSoilError("");setResult(null);setSoil(null);setSelected(0);setWells(null);setWellsError("");setWellsLoading(useCaseRef.current==="Wellsite");
    setProvenance(null);setProvenanceLoading(true);setProvenanceError("");
    const selection=map.current?.getSource("selection") as GeoJSONSource|undefined;
    selection?.setData({type:"Feature",properties:{},geometry:{type:"Point",coordinates:[lng,lat]}});
    await Promise.allSettled([
      cachedJson<GeologyResult>(lookupCache.current,`/api/geology?${coordinateQuery(lng,lat)}`,controller.signal)
        .then(data=>{if(!controller.signal.aborted)setResult(data);})
        .catch(()=>{if(!controller.signal.aborted)setError("Geology lookup is unavailable. Try again shortly.");})
        .finally(()=>{if(!controller.signal.aborted)setLoading(false);}),
      cachedJson<SoilResult>(lookupCache.current,`/api/soil?${coordinateQuery(lng,lat)}`,controller.signal)
        .then(data=>{if(!controller.signal.aborted)setSoil(data.soil);})
        .catch(()=>{if(!controller.signal.aborted)setSoilError("USDA soil survey lookup is unavailable. Try again shortly.");})
        .finally(()=>{if(!controller.signal.aborted)setSoilLoading(false);})
    ]);
  },[setSelectionMode]);

  useEffect(()=>{
    if(!point||useCase!=="Wellsite")return;
    const controller=new AbortController();
    fetch(`/api/wells?lng=${point[0]}&lat=${point[1]}&radiusKm=15&limit=12`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Public well records are unavailable.");return response.json() as Promise<WellsResult>;})
      .then(data=>{if(!controller.signal.aborted)setWells(data);})
      .catch(()=>{if(!controller.signal.aborted)setWellsError("Public well records could not be loaded. Soil and geology remain available.");})
      .finally(()=>{if(!controller.signal.aborted)setWellsLoading(false);});
    return()=>controller.abort();
  },[point,useCase]);

  useEffect(()=>{
    if(!point)return;
    const controller=new AbortController();
    fetch(`/api/provenance?lng=${point[0]}&lat=${point[1]}`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<SourceProvenance>;})
      .then(data=>{if(!controller.signal.aborted)setProvenance(data);})
      .catch(()=>{if(!controller.signal.aborted)setProvenanceError("Source metadata could not be checked.");})
      .finally(()=>{if(!controller.signal.aborted)setProvenanceLoading(false);});
    return()=>controller.abort();
  },[point]);

  useEffect(()=>{
    if(!area)return;
    const controller=new AbortController();
    const lookup=async(domain:"soil"|"geology",sample:{longitude:number;latitude:number}):Promise<PointLookup<Soil|GeologyResult>>=>{
      const source=domain==="soil"?"USDA NRCS Soil Data Access / SSURGO":"Macrostrat / original map authors";
      const href=domain==="soil"?"https://sdmdataaccess.sc.egov.usda.gov/":"https://macrostrat.org/api/v2/geologic_units/map";
      const response=await fetch(`/api/${domain}?lng=${sample.longitude}&lat=${sample.latitude}`,{signal:controller.signal});
      if(!response.ok)throw new Error(`${domain} service returned HTTP ${response.status}`);
      const retrievedAt=new Date().toISOString();
      if(domain==="soil"){
        const data=await response.json() as SoilResult;
        return {status:data.soil?"available" as const:"no-record" as const,source,href,retrievedAt,data:data.soil??undefined};
      }
      const data=await response.json() as GeologyResult;
      return {status:data.units.length?"available" as const:"no-record" as const,source,href,retrievedAt,data:data.units.length?data:undefined};
    };
    collectAreaEvidence<Soil,GeologyResult>(area.bbox,lookup).then(evidence=>{
      if(!controller.signal.aborted)setAreaEvidence(evidence);
    }).catch(cause=>{
      if(!controller.signal.aborted)setAreaEvidenceError(cause instanceof Error?cause.message:"Area evidence unavailable.");
    }).finally(()=>{if(!controller.signal.aborted)setAreaEvidenceLoading(false);});
    return()=>controller.abort();
  },[area]);

  useEffect(()=>{
    if(!ready)return;
    const source=map.current?.getSource("nearbyWells") as GeoJSONSource|undefined;
    source?.setData({type:"FeatureCollection",features:(wells?.wells??[]).map(well=>({type:"Feature" as const,properties:{id:well.id,name:well.name},geometry:{type:"Point" as const,coordinates:[well.longitude,well.latitude]}}))});
  },[ready,wells]);

  useEffect(()=>{
    const m=map.current;
    if(!ready||!m||!point)return;
    const update=()=>{
      const elevation=m.queryTerrainElevation(point);
      setTerrainElevation(elevation==null||!Number.isFinite(elevation)?null:Math.round(elevation));
    };
    m.on("idle",update);
    return()=>{m.off("idle",update);};
  },[ready,point]);

  function clearSelection(){
    setSelectionMode(false);
    request.current?.abort();
    (map.current?.getSource("selection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});
    (map.current?.getSource("areaSelection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});
    setPoint(null);setTerrainElevation(null);setResult(null);setSoil(null);setBuilding(null);setWells(null);setWellsLoading(false);setWellsError("");
    setArea(null);setAreaError("");
    setProvenance(null);setProvenanceLoading(false);setProvenanceError("");
    setAreaEvidence(null);setAreaEvidenceLoading(false);setAreaEvidenceError("");
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

  function exportSurvey(format:"html"|"json"|"geojson"){
    if(!point)return;
    const status=(present:boolean,failed:boolean,pending:boolean):EvidenceStatus=>present?"available":failed?"unavailable":pending?"not-queried":"no-record";
    const selection=createSurveySelection({
      coordinates:{longitude:point[0],latitude:point[1]},
      soil:{status:status(Boolean(soil),Boolean(soilError),soilLoading),data:soil,source:"USDA NRCS Soil Data Access / SSURGO"},
      geology:{status:status(Boolean(result?.units.length),Boolean(error),loading),units:result?.units,refs:result?.refs,source:"Macrostrat / original map authors"},
      wells:useCase==="Wellsite"?{status:status(Boolean(wells?.wells.length),Boolean(wellsError),wellsLoading),records:wells?.wells.map(well=>({id:well.id,name:well.name,source:wells.source.attribution,sourceUrl:wells.source.datasetUrl,latitude:well.latitude,longitude:well.longitude,status:well.status,attributes:{api:well.api,operator:well.operator,type:well.type,field:well.field,county:well.county,distanceKm:well.distanceKm}})),source:wells?.source.attribution||"Utah Oil Gas Wells / UGRC"}:{status:"not-queried"},
      context:[
        {label:"Terrain elevation (metres)",value:terrainElevation,source:"Mapterhorn DEM and source contributors",kind:"derived",method:"MapLibre terrain elevation sampled at the selected WGS84 point; native source resolution and vertical datum vary by tile."},
        {label:"Aerial scene acquisition date",value:provenance?.imagery.scene?.acquisitionDate??null,source:"USGS NAIP Plus ImageServer catalog",kind:"observed",method:"Catalog scene intersecting this coordinate; queried for this report."},
        {label:"Aerial source scene resolution",value:provenance?.imagery.scene?.resolution!=null?`${provenance.imagery.scene.resolution} ${provenance.imagery.scene.resolutionUnits??"units unstated"}`:null,source:"USGS NAIP Plus ImageServer catalog",kind:"observed",method:"Scene metadata, not Web Mercator display pixel size."},
        {label:"Independent USGS EPQS elevation (metres)",value:provenance?.elevation.result?.elevation??null,source:"USGS Elevation Point Query Service",kind:"derived",method:"Interpolated 3DEP elevation; source datum may be unknown and must not be directly compared with the Mapterhorn value."},
      ],
    });
    const body=format==="html"?buildSurveyReportHtml(selection):format==="geojson"?serializeSurveyGeoJSON(selection):serializeSurveyJSON(selection);
    const mime=format==="html"?"text/html":format==="geojson"?"application/geo+json":"application/json";
    const url=URL.createObjectURL(new Blob([body],{type:`${mime};charset=utf-8`}));
    const link=document.createElement("a");link.href=url;link.download=`geo-graph-survey-${point[1].toFixed(5)}-${point[0].toFixed(5)}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportArea(){
    if(!area)return;
    const payload={type:"FeatureCollection",name:"Geo Graph area selection",features:[{type:"Feature",properties:{areaSquareMeters:area.area.squareMeters,areaHectares:area.area.hectares,areaMethod:area.area.method,coordinateReferenceSystem:"OGC:CRS84",interpretation:"Five point samples describe published records at those positions only; they do not establish uniform conditions throughout the polygon.",areaEvidence:areaEvidence??{status:areaEvidenceLoading?"not-queried":areaEvidenceError?"unavailable":"not-queried",error:areaEvidenceError||undefined}},geometry:area.geometry}]};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/geo+json;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="geo-graph-area-selection.geojson";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importLog(event:React.ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    setLogError("");setLocalLog(null);setLogName("");
    if(file.size>LAS_LIMITS.textCharacters){setLogError("Choose a text LAS file under 5 MB.");return;}
    try{
      const parsed=parseLas(await file.text());
      if(!parsed.ok){setLogError(parsed.error);return;}
      setLocalLog(parsed.log);setLogName(file.name);
      setLogCurve(Math.max(0,parsed.log.curves.findIndex(curve=>curve!==parsed.log.depthCurve)));
    }catch{setLogError("This file could not be read as a text LAS log.");}
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
        const mapStarted=performance.now();
        const m=new Map({maxTileCacheSize:96,container:container.current,center:[-112.112,36.106],zoom:10.5,pitch:55,bearing:-28,maxZoom:18,maxPitch:75,centerClampedToGround:true,aroundCenter:true,attributionControl:false,canvasContextAttributes:{antialias:true},style:{version:8,projection:{type:"mercator"},glyphs:"https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",sources:{
          satellite:{type:"raster",tiles:["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community"},
          clarity:{type:"raster",tiles:[CLEAR_IMAGERY_URL],tileSize:256,maxzoom:19,attribution:"World Imagery (Clarity) archive © Esri, Vantor, Earthstar Geographics, IGN and GIS User Community"},
          aerial:{type:"raster",tiles:["https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512%2C512&format=png32&transparent=true&f=image"],tileSize:512,minzoom:12,maxzoom:19,bounds:[-125,24,-66,50],attribution:'High-resolution U.S. aerial imagery: <a href="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer">USGS, USDA, The National Map</a>'},
          topo:{type:"raster",tiles:["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:16,attribution:"Topography: USGS (United States)"},
          terrain:{type:"raster-dem",url:"https://tiles.mapterhorn.com/tilejson.json",attribution:'Elevation: <a href="https://mapterhorn.com/attribution/">Mapterhorn and source contributors</a>'},
          hillshade:{type:"raster-dem",url:"https://tiles.mapterhorn.com/tilejson.json"},
          contours:{type:"vector",tiles:[contourDem.contourProtocolUrl({multiplier:1,thresholds:{8:[200,1000],9:[100,500],11:[50,250],13:[20,100],15:[10,50]},contourLayer:"contours",elevationKey:"ele",levelKey:"level",extent:4096,buffer:1})],maxzoom:15},
          geology:{type:"raster",tiles:[`${window.location.origin}/api/tiles/{z}/{x}/{y}`],tileSize:256,maxzoom:14,attribution:'<a href="https://macrostrat.org">Macrostrat</a> & original survey authors · CC BY 4.0'},
          soilSurvey:{type:"raster",tiles:["https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms?service=WMS&version=1.1.1&request=GetMap&layers=mapunitpoly&styles=&format=image/png&transparent=true&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256"],tileSize:256,minzoom:5,maxzoom:17,bounds:[-180,17,-65,72],attribution:'Soil map units: <a href="https://sdmdataaccess.nrcs.usda.gov/">USDA NRCS Soil Data Access</a>'},
          faults:{type:"raster",tiles:["https://earthquake.usgs.gov/arcgis/rest/services/eq/map_faults/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:11,attribution:"Faults: USGS Quaternary Fault and Fold Database"},
          openfreemap:{type:"vector",url:"https://tiles.openfreemap.org/planet",attribution:'<a href="https://openfreemap.org">OpenFreeMap</a> · © OpenStreetMap contributors'},
          nearbyWells:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
          areaSelection:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
          selection:{type:"geojson",data:{type:"FeatureCollection",features:[]}},
        },layers:[
          {id:"space",type:"background",paint:{"background-color":"#06111d"}},
          {id:"satellite",type:"raster",source:"satellite",paint:{"raster-saturation":0.08,"raster-contrast":0.08,"raster-brightness-min":0,"raster-brightness-max":1,"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"clarity",type:"raster",source:"clarity",layout:{visibility:"none"},paint:{"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"aerial",type:"raster",source:"aerial",minzoom:12,layout:{visibility:"none"},paint:{"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"topo",type:"raster",source:"topo",layout:{visibility:"none"},paint:{"raster-contrast":0.02,"raster-brightness-max":0.98,"raster-resampling":"linear","raster-fade-duration":180}},
          {id:"terrain-material",type:"color-relief",source:"hillshade",paint:{"color-relief-color":["interpolate",["linear"],["elevation"],-500,"#264d59",0,"#486e68",250,"#71836a",750,"#9a9868",1500,"#b48b64",2500,"#b67e60",3500,"#c9b89a",4500,"#e2ded0",6000,"#f5f5f1"],"color-relief-opacity":0,"resampling":"linear"}},
          {id:"terrain-shade",type:"hillshade",source:"hillshade",minzoom:5,paint:{"hillshade-method":"multidirectional","hillshade-illumination-anchor":"map","hillshade-illumination-direction":315,"hillshade-illumination-altitude":45,"hillshade-shadow-color":"#15252d","hillshade-highlight-color":"#f7f0db","hillshade-accent-color":"#52656a","hillshade-exaggeration":["interpolate",["linear"],["zoom"],5,0.28,11,0.2,15,0.08,18,0.03]}},
          {id:"geology",type:"raster",source:"geology",layout:{visibility:"none"},paint:{"raster-opacity":0.76,"raster-fade-duration":180}},
          {id:"soil-survey",type:"raster",source:"soilSurvey",minzoom:5,layout:{visibility:"none"},paint:{"raster-opacity":0.82,"raster-fade-duration":180,"raster-resampling":"linear"}},
          {id:"terrain-contours",type:"line",source:"contours","source-layer":"contours",minzoom:8,layout:{visibility:"none","line-cap":"round","line-join":"round"},paint:{"line-color":"#f5edcf","line-opacity":["interpolate",["linear"],["zoom"],8,0.08,10,0.18,12,0.32,15,0.44],"line-width":["interpolate",["linear"],["zoom"],8,["match",["get","level"],1,0.55,0.25],15,["match",["get","level"],1,1.15,0.65]]}},
          {id:"faults",type:"raster",source:"faults",layout:{visibility:"none"}},
          {id:"context-waterways",type:"line",source:"openfreemap","source-layer":"waterway",minzoom:9,paint:{"line-color":"#8dd3e5","line-opacity":0.65,"line-width":["interpolate",["linear"],["zoom"],9,0.5,15,1.5]}},
          {id:"context-roads",type:"line",source:"openfreemap","source-layer":"transportation",minzoom:10,filter:["in",["get","class"],["literal",["motorway","trunk","primary","secondary","tertiary"]]],paint:{"line-color":"#fff1ca","line-opacity":0.6,"line-width":["interpolate",["linear"],["zoom"],10,0.5,15,1.8]}},
          {id:"country-border-casing",type:"line",source:"openfreemap","source-layer":"boundary",maxzoom:12,filter:["==",["get","admin_level"],2],paint:{"line-color":"#142f38","line-opacity":0.8,"line-width":["interpolate",["linear"],["zoom"],0,1.8,6,3,12,4]}},
          {id:"country-borders",type:"line",source:"openfreemap","source-layer":"boundary",maxzoom:12,filter:["==",["get","admin_level"],2],paint:{"line-color":"#ffe08a","line-opacity":0.95,"line-width":["interpolate",["linear"],["zoom"],0,0.7,6,1.4,12,2]}},
          {id:"state-borders",type:"line",source:"openfreemap","source-layer":"boundary",minzoom:3,maxzoom:10,filter:["==",["get","admin_level"],4],paint:{"line-color":"#fff3d0","line-opacity":["interpolate",["linear"],["zoom"],3,0.35,7,0.7,10,0.35],"line-width":["interpolate",["linear"],["zoom"],3,0.5,7,1.2]}},
          {id:"country-labels",type:"symbol",source:"openfreemap","source-layer":"place",minzoom:0,maxzoom:6,filter:["==",["get","class"],"country"],layout:{"text-field":["coalesce",["get","name:en"],["get","name"]],"text-font":["Noto Sans Regular"],"text-size":["interpolate",["linear"],["zoom"],1,11,5,18],"text-letter-spacing":0.14,"text-transform":"uppercase","text-max-width":9,"text-padding":8,"text-allow-overlap":false},paint:{"text-color":"#fff6d7","text-halo-color":"#102c3a","text-halo-width":2.2,"text-halo-blur":0.5}},
          {id:"state-labels",type:"symbol",source:"openfreemap","source-layer":"place",minzoom:3,maxzoom:9,filter:["in",["get","class"],["literal",["state","province"]]],layout:{"text-field":["coalesce",["get","name:en"],["get","name"]],"text-font":["Noto Sans Regular"],"text-size":["interpolate",["linear"],["zoom"],3,10,7,16],"text-letter-spacing":0.1,"text-max-width":9,"text-padding":8,"text-allow-overlap":false},paint:{"text-color":"#ffffff","text-halo-color":"#17323e","text-halo-width":2,"text-halo-blur":0.5}},
          {id:"city-labels",type:"symbol",source:"openfreemap","source-layer":"place",minzoom:7,maxzoom:14,filter:["in",["get","class"],["literal",["city","town"]]],layout:{"text-field":["coalesce",["get","name:en"],["get","name"]],"text-font":["Noto Sans Regular"],"text-size":["interpolate",["linear"],["zoom"],7,11,12,15],"text-max-width":8,"text-padding":10,"text-allow-overlap":false},paint:{"text-color":"#ffffff","text-halo-color":"#18343d","text-halo-width":2,"text-halo-blur":0.4}},
          {id:"3d-buildings",type:"fill-extrusion",source:"openfreemap","source-layer":"building",minzoom:14,layout:{visibility:"none"},paint:{
             "fill-extrusion-color":"#b8c5c8",
             "fill-extrusion-height":["get","render_height"],
             "fill-extrusion-base":["get","render_min_height"],"fill-extrusion-opacity":0.9,"fill-extrusion-vertical-gradient":true}},
          {id:"nearby-wells-halo",type:"circle",source:"nearbyWells",paint:{"circle-radius":9,"circle-color":"#0d4350","circle-opacity":0.8,"circle-stroke-color":"#e9ce85","circle-stroke-width":2,"circle-pitch-alignment":"map"}},
          {id:"nearby-wells-core",type:"circle",source:"nearbyWells",paint:{"circle-radius":2.5,"circle-color":"#fff8dc","circle-pitch-alignment":"map"}},
          {id:"area-fill",type:"fill",source:"areaSelection",paint:{"fill-color":"#ffbd4a","fill-opacity":0.2}},
          {id:"area-outline",type:"line",source:"areaSelection",paint:{"line-color":"#ffbd4a","line-width":3,"line-dasharray":[2,1]}},
          {id:"selection-halo",type:"circle",source:"selection",paint:{"circle-radius":20,"circle-color":"rgba(255,189,74,0.2)","circle-stroke-color":"#ffbd4a","circle-stroke-width":3,"circle-pitch-alignment":"map"}},
          {id:"selection-core",type:"circle",source:"selection",paint:{"circle-radius":4,"circle-color":"#fff","circle-stroke-color":"#0b3340","circle-stroke-width":2,"circle-pitch-alignment":"map"}},
        ],terrain:{source:"terrain",exaggeration:1},sky:{"sky-color":"#8fb9c7","horizon-color":"#dce9e6","fog-color":"#d7e2de","fog-ground-blend":0.18,"horizon-fog-blend":0.72,"sky-horizon-blend":0.84,"atmosphere-blend":0.32}}});
        m.on("sourcedata",event=>{if(event.sourceId&&event.coord)coverage.current.set(event.sourceId,viewKey(m));});
        map.current=m;m.addControl(new NavigationControl({visualizePitch:true}),"top-right");m.addControl(new ScaleControl(),"bottom-left");m.addControl(new AttributionControl({compact:true}),"bottom-right");
        m.setCenterClampedToGround(true);
        m.on("load",()=>{m.setSourceTileLodParams(6,5,"satellite");m.setSourceTileLodParams(6,3,"aerial");m.setSourceTileLodParams(6,4,"terrain");m.setSourceTileLodParams(6,4,"hillshade");recordMetric("maplibre-initial-ready",mapStarted);setReady(true);});m.on("moveend",()=>{const z=m.getZoom();setZoom(z);if(z<=GLOBE_ENTER_ZOOM)terrainRevealDone.current=false;setMode(current=>z<=GLOBE_ENTER_ZOOM?"GLOBE":z>=TERRAIN_ENTER_ZOOM?"TERRAIN":current);});
        m.on("zoomend",()=>{const z=m.getZoom();if(!terrainRevealDone.current&&z>=9&&m.getPitch()<50){terrainRevealDone.current=true;m.easeTo({pitch:55,bearing:-22,duration:900});}});
        m.on("moveend",()=>m.setCenterClampedToGround(true));
        m.on("idle",()=>setSceneLoading(false));
        m.on("click",e=>{
          m.stop();
          const location=e.lngLat.wrap();
          if(selectingRef.current&&areaModeRef.current){
            if(m.getZoom()<12){
              terrainRevealDone.current=true;
              m.easeTo({center:location,zoom:13,pitch:45,duration:900});
              return;
            }
            if(!areaFirst.current){areaFirst.current=[location.lng,location.lat];setAreaAwaiting(true);setAreaError("");return;}
            const rectangle=createRectangleSelection(areaFirst.current,[location.lng,location.lat]);
            if(!rectangle.ok){setAreaError(rectangle.message);areaFirst.current=null;setAreaAwaiting(false);return;}
            request.current?.abort();
            setPoint(null);setTerrainElevation(null);setSoil(null);setResult(null);setBuilding(null);setWells(null);setWellsLoading(false);setWellsError("");setLoading(false);setSoilLoading(false);setError("");setSoilError("");
            setProvenance(null);setProvenanceLoading(false);setProvenanceError("");
            setAreaEvidence(null);setAreaEvidenceLoading(true);setAreaEvidenceError("");
            (m.getSource("selection") as GeoJSONSource|undefined)?.setData({type:"FeatureCollection",features:[]});
            (m.getSource("areaSelection") as GeoJSONSource|undefined)?.setData({type:"Feature",properties:{areaSquareMeters:rectangle.selection.area.squareMeters},geometry:rectangle.selection.geometry});
            setArea(rectangle.selection);setAreaError("");setSelectionMode(false);
            return;
          }
          const hits=m.queryRenderedFeatures(e.point,{layers:m.getLayer("overture-buildings")&&overtureEnabledRef.current?["overture-buildings"]:["3d-buildings"]});
          void inspectGround(location.lng,location.lat,hits.length?buildingFromFeature(hits[0]):null);
          if(m.getZoom()<12){
            terrainRevealDone.current=true;
            m.easeTo({center:location,zoom:13,pitch:45,duration:900});
          }
        });
        m.on("error",e=>{if(e.error)console.warn("Geo Graph map tile error; the underlying imagery remains available",e.error);});
      }catch{setMapError("The 3D globe could not start. Reload in a browser with WebGL enabled.");}
    }).catch(()=>setMapError("The map renderer could not load. Please reload the page."));
    return()=>{disposed=true;request.current?.abort();searchRequest.current?.abort();map.current?.remove();map.current=null;};
  },[inspectGround,setSelectionMode]);

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    let timer:number|undefined;
    let controller:AbortController|null=null;
    const locate=()=>{
      if(timer!==undefined)window.clearTimeout(timer);
      controller?.abort();
      const center=m.getCenter().wrap();
      setMapCenter([center.lng,center.lat]);
      setMapPlace(null);
      timer=window.setTimeout(()=>{
        const requestController=new AbortController();
        controller=requestController;
        fetch(`/api/location?lng=${center.lng.toFixed(4)}&lat=${center.lat.toFixed(4)}`,{signal:requestController.signal})
          .then(async response=>{if(!response.ok)throw new Error();return response.json() as Promise<{state:string|null;country:string|null}>;})
          .then(data=>{if(!requestController.signal.aborted)setMapPlace({state:data.state,country:data.country});})
          .catch(()=>{});
      },500);
    };
    m.on("moveend",locate);
    const initial=window.setTimeout(locate,0);
    return()=>{m.off("moveend",locate);window.clearTimeout(initial);if(timer!==undefined)window.clearTimeout(timer);controller?.abort();};
  },[ready]);


  /* eslint-disable react-hooks/set-state-in-effect -- Synchronizes pending/committed UI with the external map renderer. */
  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    if(surfaceMode===displaySurface&&base===displayBase){setLayerStatus("");return;}
    const started=performance.now();
    const center=m.getCenter();
    if((surfaceMode==="Soil"||base==="topo")&&(center.lng< -180||center.lng> -65||center.lat<17||center.lat>72)){
      setLayerStatus("This layer covers the U.S. Previous view retained.");return;
    }
    const targets:string[]=surfaceMode==="Bare Earth"?[]:[base==="topo"?"topo":base==="clarity"?"clarity":"satellite",...(surfaceMode==="Geology"?["geology"]:surfaceMode==="Soil"?["soil-survey"]:[])];
    const sourceFor=(layer:string)=>layer==="soil-survey"?"soilSurvey":layer;
    let stopped=false;
    const staged: {id:string;visibility:"visible"|"none";opacity:number}[]=[];
    let timer:ReturnType<typeof setTimeout>|undefined=undefined;
    const clear=()=>{m.off("sourcedata",check);m.off("render",check);m.off("error",failed);clearTimeout(timer);};
    const commit=()=>{if(stopped)return;stopped=true;clear();setDisplaySurface(surfaceMode);setDisplayBase(base);setLayerStatus("");recordMetric("maplibre-layer-"+surfaceMode,started);};
    const restore=()=>{for(const item of staged)if(m.getLayer(item.id)){m.setLayoutProperty(item.id,"visibility",item.visibility??"visible");m.setPaintProperty(item.id,"raster-opacity",item.opacity??1);}};
    const reject=()=>{if(stopped)return;stopped=true;clear();restore();setLayerStatus(`${surfaceMode} unavailable here. Previous view retained.`);recordMetric("maplibre-layer-failed-"+surfaceMode,started);};
    function check(){if(!stopped&&hasLayerCoverage(targets.map(sourceFor),viewKey(m!),coverage.current,id=>m!.isSourceLoaded(id)))commit();}
    function failed(event:unknown){if(targets.map(sourceFor).includes((event as {sourceId:string}).sourceId))reject();}
    if(!targets.length||mode==="GLOBE"){commit();return;}
    setLayerStatus(`Loading ${surfaceMode==="Natural"?base:surfaceMode}…`);
    for(const target of targets){
      if(m.getLayoutProperty(target,"visibility")!=="none")continue;
      staged.push({id:target,visibility:m.getLayoutProperty(target,"visibility")==="none"?"none":"visible",opacity:Number(m.getPaintProperty(target,"raster-opacity")??1)});
      m.setPaintProperty(target,"raster-opacity-transition",{duration:180,delay:0});
      m.setPaintProperty(target,"raster-opacity",0.001);m.setLayoutProperty(target,"visibility","visible");
    }
    m.on("sourcedata",check);m.on("render",check);m.on("error",failed);
    timer=setTimeout(reject,12000);m.triggerRepaint();
    return()=>{clear();if(!stopped){stopped=true;restore();}};
  },[ready,surfaceMode,base,displaySurface,displayBase,mode]);
  useEffect(()=>{const m=map.current;if(!m||!ready)return;const terrainActive=mode==="TERRAIN";const showUnderlay=terrainActive&&displaySurface!=="Bare Earth";const underlayOpacity=displaySurface==="Natural"?1:displaySurface==="Geology"?0.42:0.5;if(terrainActive){m.setProjection({type:"mercator"});m.setTerrain({source:"terrain",exaggeration:1});}else{m.setTerrain(null);m.setProjection({type:"globe"});}m.setLayoutProperty("satellite","visibility",!terrainActive||showUnderlay&&(displayBase==="satellite"||displayBase==="clarity")?"visible":"none");m.setLayoutProperty("clarity","visibility",showUnderlay&&displayBase==="clarity"?"visible":"none");m.setLayoutProperty("aerial","visibility",showUnderlay&&displayBase==="satellite"&&aerialEnabled?"visible":"none");m.setLayoutProperty("topo","visibility",showUnderlay&&displayBase==="topo"?"visible":"none");m.setPaintProperty("satellite","raster-opacity",terrainActive?underlayOpacity:1);m.setPaintProperty("clarity","raster-opacity",underlayOpacity);m.setPaintProperty("aerial","raster-opacity",underlayOpacity);m.setPaintProperty("satellite","raster-saturation",terrainActive&&displaySurface!=="Natural"?-0.2:0.08);m.setPaintProperty("topo","raster-opacity",underlayOpacity);m.setLayoutProperty("terrain-material","visibility",terrainActive?"visible":"none");m.setPaintProperty("terrain-material","color-relief-opacity",displaySurface==="Natural"?0:displaySurface==="Bare Earth"?0.96:displaySurface==="Geology"?0.1:0.07);m.setLayoutProperty("terrain-shade","visibility",terrainActive?"visible":"none");m.setPaintProperty("terrain-shade","hillshade-exaggeration",displaySurface==="Bare Earth"?0.5:["interpolate",["linear"],["zoom"],5,0.28,11,0.2,15,0.08,18,0.03]);m.setPaintProperty("terrain-contours","line-color",displaySurface==="Bare Earth"?"#263f42":"#f5edcf");m.setLayoutProperty("terrain-contours","visibility",terrainActive&&contours?"visible":"none");m.setPaintProperty("geology","raster-opacity",0.76);m.setPaintProperty("soil-survey","raster-opacity",0.82);m.setLayoutProperty("geology","visibility",terrainActive&&displaySurface==="Geology"?"visible":"none");m.setLayoutProperty("soil-survey","visibility",terrainActive&&displaySurface==="Soil"?"visible":"none");m.setLayoutProperty("faults","visibility",terrainActive&&faults?"visible":"none");m.setLayoutProperty("country-border-casing","visibility",borders?"visible":"none");m.setLayoutProperty("country-borders","visibility",borders?"visible":"none");m.setLayoutProperty("state-borders","visibility",borders?"visible":"none");m.setLayoutProperty("3d-buildings","visibility",terrainActive&&buildings&&!overtureEnabled?"visible":"none");m.setCenterClampedToGround(true);},[ready,mode,displaySurface,displayBase,aerialEnabled,contours,faults,borders,buildings,overtureEnabled]);

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

  useEffect(()=>{
    const m=map.current;if(!m||!ready)return;
    overtureEnabledRef.current=overtureEnabled;
    let disposed=false;
    if(!overtureEnabled){if(m.getLayer("overture-buildings"))m.setLayoutProperty("overture-buildings","visibility","none");return;}
    setBuildingStatus("Loading Overture building detail…");
    import("pmtiles").then(async({Protocol})=>{
      const maplibre=await import("maplibre-gl");if(disposed)return;
      if(!m.getSource("overture")){
        const protocol=new Protocol();maplibre.addProtocol("pmtiles",protocol.tile);
        m.addSource("overture",{type:"vector",url:`pmtiles://${OVERTURE_BUILDINGS}`,minzoom:14,maxzoom:14,attribution:'© OpenStreetMap · <a href="https://docs.overturemaps.org/attribution">Overture Maps Foundation</a>'});
        m.addLayer({id:"overture-buildings",type:"fill-extrusion",source:"overture","source-layer":"building",minzoom:14,filter:["!=",["get","is_underground"],true],paint:{"fill-extrusion-color":"#b6c7c9","fill-extrusion-height":["coalesce",["get","height"],["*",["coalesce",["get","num_floors"],2],3.2]],"fill-extrusion-base":["coalesce",["get","min_height"],0],"fill-extrusion-opacity":0.9}},"selection-halo");
      }
      m.setLayoutProperty("overture-buildings","visibility","visible");setBuildingStatus("Overture 2026-09-23 · close zoom only · missing heights estimated. Inspection tiles, coverage varies.");
    }).catch(()=>{if(!disposed){setBuildingStatus("Overture unavailable. Standard buildings remain available.");setOvertureEnabled(false);}});
    return()=>{disposed=true;};
  },[ready,overtureEnabled]);

  /* eslint-enable react-hooks/set-state-in-effect */
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
  function navigateToScale(scale:"world"|"region"|"ground"){
    const m=map.current;if(!m||!ready)return;
    const target=scale==="world"?{zoom:2.3,pitch:0,bearing:0}:scale==="region"?{zoom:5.5,pitch:20,bearing:m.getBearing()}:{zoom:12,pitch:55,bearing:m.getBearing()};
    terrainRevealDone.current=scale==="ground";
    m.stop();setSceneLoading(true);
    m.easeTo({...target,center:m.getCenter().wrap(),duration:1100,essential:true});
  }
  function openPilot(){
    applyUseCase("Wellsite");
    goToView({name:"Uinta Basin public-data pilot",icon:"",point:UINTA_PILOT_POINT,zoom:16.2,pitch:55,bearing:-22});
    void inspectGround(...UINTA_PILOT_POINT);
  }
  function selectCenter(){const m=map.current;if(!m||m.getZoom()<12)return;const center=m.getCenter().wrap();void inspectGround(center.lng,center.lat);}
  function returnToSelection(){const m=map.current;if(!m||!point)return;m.setCenterClampedToGround(true);m.easeTo({center:point,duration:900,essential:true});}
  async function search(event:React.FormEvent){event.preventDefault();if(!query.trim())return;searchRequest.current?.abort();const controller=new AbortController();searchRequest.current=controller;setSearching(false);setSearchError("");setPlaces([]);const coords=query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);if(coords){const lat=Number(coords[1]),lng=Number(coords[2]);if(Math.abs(lat)>85||Math.abs(lng)>180){setSearchError("Use latitude −85 to 85 and longitude −180 to 180.");return;}goToView({name:"Coordinates",icon:"",point:[lng,lat],zoom:12,pitch:55,bearing:-22});return;}setSearching(true);try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{signal:controller.signal});if(!response.ok)throw new Error("Place search is unavailable. Enter latitude, longitude instead.");const data=await response.json() as Place[];if(controller.signal.aborted)return;setPlaces(data);if(!data.length)setSearchError("No places found. Try a nearby city or latitude, longitude.");}catch(cause){if(controller.signal.aborted)return;setSearchError(cause instanceof Error?cause.message:"Search failed.");}finally{if(!controller.signal.aborted)setSearching(false);}}
  const unit=result?.units[selected];
  const activeCase=USE_CASE_COPY[useCase];
  const activeSurface=SURFACE_COPY[surfaceMode];
  const surfaceSource=surfaceMode==="Natural"&&base==="topo"?"USGS topo + Mapterhorn elevation":surfaceMode==="Natural"&&base==="clarity"?"Esri Clarity archive + Mapterhorn elevation":surfaceMode==="Natural"&&aerialEnabled?"Esri + USGS aerial + Mapterhorn elevation":activeSurface.source;
  const mapPlaceName=[mapPlace?.state,mapPlace?.country].filter((part,index,parts)=>part&&parts.indexOf(part)===index).join(", ");
  const mapContext=mapPlaceName?`${mapPlaceName} · approximate`:`${mapCenter[1].toFixed(2)}°, ${mapCenter[0].toFixed(2)}°`;
  const soilValue=(value:unknown, fallback="Not available")=>value==null||value===""?fallback:String(value);
  const textureParts=soil?[{label:"Sand",value:soil.sandPercent,color:"#dcae63"},{label:"Silt",value:soil.siltPercent,color:"#a8b978"},{label:"Clay",value:soil.clayPercent,color:"#96705c"}].filter(part=>typeof part.value==="number"&&part.value>=0):[];
  const textureTotal=textureParts.reduce((sum,part)=>sum+(part.value as number),0);
  const logPreview=useMemo(()=>{
    if(!localLog)return null;
    const measurements=localLog.rows.map(row=>row.values[logCurve]).filter((value):value is number=>value!=null&&Number.isFinite(value));
    if(!measurements.length)return null;
    let minValue=Infinity,maxValue=-Infinity,minDepth=Infinity,maxDepth=-Infinity;
    for(const value of measurements){minValue=Math.min(minValue,value);maxValue=Math.max(maxValue,value);}
    for(const row of localLog.rows){minDepth=Math.min(minDepth,row.depth);maxDepth=Math.max(maxDepth,row.depth);}
    const step=Math.max(1,Math.ceil(localLog.rows.length/240));
    let path="",started=false;
    for(let index=0;index<localLog.rows.length;index+=step){
      const row=localLog.rows[index],value=row.values[logCurve];
      if(value==null||!Number.isFinite(value)){started=false;continue;}
      const x=12+(maxValue===minValue?0.5:(value-minValue)/(maxValue-minValue))*136;
      const y=12+(maxDepth===minDepth?0.5:(row.depth-minDepth)/(maxDepth-minDepth))*156;
      path+=`${started?"L":"M"}${x.toFixed(1)},${y.toFixed(1)} `;started=true;
    }
    return {path,minValue,maxValue,minDepth,maxDepth};
  },[localLog,logCurve]);
  const kpis=[
    {label:"SURVEY STATUS",value:soilLoading?"Reading…":soil?"Mapped unit":soilError?"Unavailable":point?"No coverage":area?"Area selected":"Awaiting point",tone:soil?"good":"neutral"},
    {label:"MAP UNIT",value:soil?.mapUnitSymbol||"—",tone:"neutral"},
    {label:"SLOPE",value:soil?.slopePercent!=null?`${soil.slopePercent}%`:"—",tone:"neutral"},
    {label:"pH",value:soil?.ph!=null?String(soil.ph):"—",tone:"neutral"},
  ];
  const areaSoilNames=areaEvidence?[...new Set(areaEvidence.samples.map(sample=>(sample.soil.data as Soil|undefined)?.mapUnitName).filter((name):name is string=>Boolean(name)))]:[];
  const areaGeologyNames=areaEvidence?[...new Set(areaEvidence.samples.flatMap(sample=>(sample.geology.data as GeologyResult|undefined)?.units.map(unit=>unit.name).filter(Boolean)??[]))]:[];
  const surfaceHorizon=soil?.horizons?.[0];
  const useCaseFacts:Record<UseCase,Array<[string,string]>>={
    Overview:[["Map unit",soil?`${soil.mapUnitSymbol} · ${soil.mapUnitName}`:"—"],["Dominant component",soil?.componentName||"—"],["Representative slope",soil?.slopePercent!=null?`${soil.slopePercent}%`:"—"],["Drainage",soil?.drainageClass||"—"]],
    Wellsite:[["Mapped unit",unit?.name||"—"],["Rock type",unit?.lith?.replace(/[{}]/g," ")||"—"],["Terrain elevation",terrainElevation!=null?`${terrainElevation} m · DEM estimate`:"—"],["Surface slope",soil?.slopePercent!=null?`${soil.slopePercent}% · SSURGO representative value`:"—"]],
    Agriculture:[["Capability class",soil?.nonIrrigatedCapabilityClass||"—"],["Surface organic matter",soil?.organicMatterPercent!=null?`${soil.organicMatterPercent}%`:"—"],["Surface pH (1:1 water)",soil?.ph!=null?String(soil.ph):"—"],["Profile water storage",soil?.profileAvailableWaterStorageMm!=null?`${soil.profileAvailableWaterStorageMm} mm`:"—"]],
    Water:[["Hydrologic group",soil?.hydrologicGroup||"—"],["Runoff class",soil?.runoffClass||"—"],["Flooding frequency",soil?.floodingFrequency||"—"],["Ponding frequency",soil?.pondingFrequency||"—"],["Hydric rating",soil?.hydricRating||"—"]],
    Construction:[["Restriction",soil?.restrictionKind?`${soil.restrictionKind}${soil.restrictionDepthCm!=null?` · ${soil.restrictionDepthCm} cm`:""}`:"—"],["Concrete corrosion",soil?.concreteCorrosion||"—"],["Steel corrosion",soil?.steelCorrosion||"—"],["Frost action",soil?.frostAction||"—"],["Surface plasticity index",surfaceHorizon?.plasticityIndex!=null?String(surfaceHorizon.plasticityIndex):"—"]],
    Environment:[["Hydric condition",soil?.hydricCondition||soil?.hydricRating||"—"],["Surface CEC",surfaceHorizon?.cationExchangeCapacity!=null?`${surfaceHorizon.cationExchangeCapacity} cmol(+)/kg`:"—"],["Electrical conductivity",surfaceHorizon?.electricalConductivity!=null?`${surfaceHorizon.electricalConductivity} dS/m`:"—"],["Erosion K factor",surfaceHorizon?.erosionKFactor!=null?String(surfaceHorizon.erosionKFactor):"—"],["Rock fragments",surfaceHorizon?.rockFragmentsPercent!=null?`${surfaceHorizon.rockFragmentsPercent}%`:"—"]],
  };
  function horizonMetrics(horizon:Horizon):Array<[string,string]>{
    const metric=(value:number|null,units="")=>value==null?"Not rated":`${value}${units}`;
    switch(useCase){
      case "Wellsite":return [["Texture",horizon.texture||"Not rated"],["Rock fragments",metric(horizon.rockFragmentsPercent,"%")],["Ksat",metric(horizon.saturatedHydraulicConductivity," µm/s")]];
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
    <section className="location-panel"><form onSubmit={search}><label htmlFor="search">Find a place</label><div className="search-row"><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="City, landmark, or coordinates"/><button disabled={searching||!ready}>{searching?"…":"Go"}</button></div></form>{searchError&&<p role="alert" className="error">{searchError}</p>}{places.length>0&&<ul className="places">{places.map((place,index)=><li key={`${place.name}-${index}`}><button onClick={()=>goToView({name:place.name,icon:"",point:place.point,zoom:16.3,pitch:58,bearing:-24})}>{place.name}</button></li>)}</ul>}<button className="pilot-link" disabled={!ready} onClick={openPilot}>Explore Uinta Basin public-data pilot →</button></section>
    <section className="use-case-panel"><div className="section-heading"><div><p className="eyebrow">WORKSPACE VIEW</p><h2>Use case</h2></div><span className="selection-count">{point?"1 point":area?"1 area":"No selection"}</span></div><div className="use-case-tabs" aria-label="Soil use case"><div className="use-case-tab-row">{USE_CASES.map(item=><button key={item} aria-pressed={useCase===item} onClick={()=>applyUseCase(item)}>{item}</button>)}</div></div><div className="use-case-summary"><p className="workspace-action">{useCase==="Overview"?"Natural imagery · clean terrain":useCase==="Wellsite"?"Geology · public wells · mapped faults":useCase==="Agriculture"?"Soil boundaries · near-overhead view":useCase==="Water"?"Bare earth · elevation contours":useCase==="Construction"?"Geology · contours · mapped faults":"Natural imagery · elevation contours"}{mode==="GLOBE"?" · Applied when you zoom in":""}</p><strong>{activeCase.title}</strong><p>{activeCase.body}</p><div className="focus-fields">{activeCase.fields.map(field=><span key={field}>{field}</span>)}</div><dl className="use-case-facts">{useCaseFacts[useCase].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div><div className="workspace-tools"><button disabled={!ready} onClick={()=>{setSelectionMode(true);container.current?.scrollIntoView({behavior:"smooth",block:"start"});}}>Select a sample</button>{soil&&<button onClick={exportSoilReport}>Export {useCase.toLowerCase()} report</button>}</div><p className="interpretation-note">Screening context only. Confirm important decisions with an on-site investigation and the complete USDA survey.</p></section>
    <section className="display-panel"><p className="eyebrow">MAP DISPLAY</p><div className="terrain-status"><span className="layer-symbol terrain-symbol">{activeSurface.icon}</span><div><b>{activeSurface.title}</b><small>{surfaceMode==="Natural"&&base==="topo"?"USGS topographic map over detailed terrain.":base==="clarity"?"Archived Esri imagery can look clearer here, but may be older or unchanged. Detail varies by place.":activeSurface.body}</small></div></div><div className="surface-grid" aria-label="Terrain surface material">{SURFACE_MODES.map(item=><button key={item} aria-pressed={surfaceMode===item} onClick={()=>setSurfaceMode(item)}><span>{SURFACE_COPY[item].icon}</span>{item}</button>)}</div><div className="surface-legend"><div>{activeSurface.swatches.map((color,index)=><i key={color} style={{background:color}} aria-hidden="true" data-index={index}/>)}</div><span>{surfaceSource}</span></div>{surfaceMode!=="Bare Earth"&&<div className="base-switch"><button aria-pressed={base==="satellite"} onClick={()=>setBase("satellite")}>Satellite underlay</button><button aria-pressed={base==="clarity"} onClick={()=>{setBase("clarity");setAerialEnabled(false);}}>Clear imagery · archive</button><button aria-pressed={base==="topo"} onClick={()=>{setBase("topo");setAerialEnabled(false);}}>USGS topo · U.S.</button></div>}<div className="layer-grid">{base==="satellite"&&surfaceMode!=="Bare Earth"&&<button aria-pressed={aerialEnabled} onClick={()=>setAerialEnabled(!aerialEnabled)}><span className="layer-symbol terrain-symbol">▧</span><b>USGS aerial</b><small>Optional U.S. overlay · coverage varies</small></button>}<button aria-pressed={contours} onClick={()=>setContours(!contours)}><span className="layer-symbol terrain-symbol">≋</span><b>Contours</b><small>Dynamic elevation</small></button><button aria-pressed={borders} onClick={()=>setBorders(!borders)}><span className="layer-symbol border-symbol">┄</span><b>Borders</b><small>Country and state boundaries</small></button><button aria-pressed={faults} onClick={()=>setFaults(!faults)}><span className="layer-symbol fault-symbol">⌁</span><b>Faults</b><small>U.S. mapped faults</small></button><button aria-pressed={buildings} onClick={()=>setBuildings(!buildings)}><span className="layer-symbol building-symbol">▥</span><b>Buildings</b><small>{buildings&&(mode==="GLOBE"||zoom<14)?"Zoom in to see":"Optional city detail"}</small></button><button className="pbr-option" aria-pressed={pbrEnabled} onClick={togglePbrStudy}><span className="layer-symbol">⬡</span><b>PBR material study</b><small>{pbrEnabled?(pbrCanRender?pbrStatus:"Natural imagery · zoom 15+"):"Rock detail on steep terrain · illustrative"}</small></button></div><p className="display-note">{mode==="GLOBE"?"Zoom in to reveal terrain and survey layers. Your settings are preserved.":"Terrain follows your zoom. Try Clear imagery or Bare Earth where current imagery is poor."}</p></section>
    <section className="inspector" ref={inspector} tabIndex={-1} aria-label="Selected location details"><p className="eyebrow">SELECTED LOCATION</p>{!point?<div className="empty-state"><span className="select-icon">⌖</span><h2>Select the ground.</h2><p>Click any point on the map to inspect it. At broad zoom levels, the map also moves closer to your selection.</p></div>:<><div className="selection-heading"><div><p className="coordinates">{point[1].toFixed(5)}, {point[0].toFixed(5)}</p><h2>{building?building.name:"Ground selection"}</h2></div><div className="selection-actions"><button className="mini-export" onClick={clearSelection}>Clear</button><span className="selected-badge">SELECTED</span>{soil&&<button className="mini-export" onClick={exportSoilReport}>Export</button>}</div></div>{building&&<article className="data-card building-card"><h3>Building</h3><dl className="fact-grid"><div><dt>Height</dt><dd>{building.height}</dd></div><div><dt>Levels</dt><dd>{building.levels}</dd></div></dl><p>{building.source}</p></article>}<article className="data-card soil-card"><div className="card-heading"><div><span className="card-icon">◫</span><h3>Soil survey</h3></div><span>USDA SSURGO</span></div>{soilLoading&&<p role="status" className="loading-line">Reading the soil profile…</p>}{soilError&&<p role="alert" className="error">{soilError} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{!soilLoading&&!soilError&&!soil&&<p>No detailed USDA soil polygon covers this point.</p>}{soil&&<><h4>{soil.mapUnitName}</h4><p className="muted-line">{soil.surveyAreaName} · {soil.mapUnitSymbol}</p><div className="soil-profile"><div className="profile-label"><span>Surface profile</span><strong>{soil.horizonName||"Not described"}</strong></div><div className="profile-track"><span className="profile-fill" style={{width:soil.horizonBottomCm!=null?`${Math.min(100,Math.max(12,soil.horizonBottomCm/2))}%`:"28%"}}/></div><small>{soil.horizonTopCm!=null?`${soil.horizonTopCm} cm` : "Top depth unavailable"} → {soil.horizonBottomCm!=null?`${soil.horizonBottomCm} cm` : "Bottom depth unavailable"}</small></div><dl className="fact-grid"><div><dt>Major component</dt><dd>{soilValue(soil.componentName)}{soil.componentPercent!=null?` · ${soil.componentPercent}%`:""}</dd></div><div><dt>Surface texture</dt><dd>{soilValue(soil.texture)}</dd></div><div><dt>Drainage</dt><dd>{soilValue(soil.drainageClass)}</dd></div><div><dt>Hydrologic group</dt><dd>{soilValue(soil.hydrologicGroup)}</dd></div><div><dt>Slope</dt><dd>{soil.slopePercent!=null?`${soil.slopePercent}%`:"Not rated"}</dd></div><div><dt>Organic matter</dt><dd>{soil.organicMatterPercent!=null?`${soil.organicMatterPercent}%`:"Not rated"}</dd></div><div><dt>pH</dt><dd>{soil.ph??"Not rated"}</dd></div><div><dt>Taxonomy</dt><dd>{soil.taxonomicSubgroup||soil.taxonomicOrder||"Not classified"}</dd></div></dl>{textureParts.length>0&&<div className="texture-profile"><div className="profile-label"><span>Texture fractions</span><strong>{textureTotal===100?"Reported total 100%":"Reported fractions"}</strong></div><div className="texture-track">{textureParts.map(part=><span key={part.label} title={`${part.label}: ${part.value}%`} style={{width:`${(part.value as number)/Math.max(textureTotal,1)*100}%`,background:part.color}}/>)}</div><div className="texture-legend">{textureParts.map(part=><span key={part.label}><i style={{background:part.color}}/>{part.label} {part.value}%</span>)}</div></div>}{soil.taxonomicSubgroup&&<p className="taxonomy">{soil.taxonomicOrder} · {soil.taxonomicSubgroup}</p>}<details><summary>Additional survey fields</summary><dl className="fact-grid compact"><div><dt>Sand</dt><dd>{soil.sandPercent!=null?`${soil.sandPercent}%`:"—"}</dd></div><div><dt>Silt</dt><dd>{soil.siltPercent!=null?`${soil.siltPercent}%`:"—"}</dd></div><div><dt>Clay</dt><dd>{soil.clayPercent!=null?`${soil.clayPercent}%`:"—"}</dd></div><div><dt>Map unit key</dt><dd>{soil.mapUnitKey}</dd></div><div><dt>Flooding</dt><dd>{soilValue(soil.floodingFrequency)}</dd></div><div><dt>Ponding</dt><dd>{soilValue(soil.pondingFrequency)}</dd></div><div><dt>Permeability</dt><dd>{soilValue(soil.permeability)}</dd></div><div><dt>Available water</dt><dd>{soil.availableWaterCapacity!=null?`${soil.availableWaterCapacity} cm/cm`:"—"}</dd></div></dl></details></>}</article><article className="data-card geology-card"><div className="card-heading"><div><span className="card-icon geology-symbol">◒</span><h3>Surface geology</h3></div><span>MACROSTRAT</span></div>{loading&&<p role="status" className="loading-line">Reading mapped geology…</p>}{error&&<p role="alert" className="error">{error} <button onClick={()=>inspectGround(...point,building)}>Retry</button></p>}{result&&!result.units.length&&<p>No published rock units were returned at this point.</p>}{unit&&<><label htmlFor="survey">Survey interpretation</label><select id="survey" value={selected} onChange={e=>setSelected(Number(e.target.value))}>{result!.units.map((item,index)=><option key={item.map_id} value={index}>{item.name||"Unnamed unit"}</option>)}</select><h4><span className="swatch" style={{background:/^#[0-9a-f]{6}$/i.test(unit.color)?unit.color:"#aaa"}}/>{unit.name}</h4><dl className="fact-grid"><div><dt>Rock type</dt><dd>{unit.lith?.replace(/[{}]/g," ")||"Not specified"}</dd></div><div><dt>Geologic age</dt><dd>{unit.best_int_name||[unit.b_int_name,unit.t_int_name].filter(Boolean).join(" – ")||"Not specified"}</dd></div></dl>{unit.descrip&&<p>{unit.descrip}</p>}<details><summary>Survey source</summary><p>{result!.refs[String(unit.source_id)]||"See the Macrostrat source record."}</p></details></>}</article></>}</section>
    {(area||areaError)&&<section className="area-panel">
      <div className="section-heading"><div><p className="eyebrow">SELECTED AREA</p><h2>Ground footprint</h2></div>{area&&<button className="mini-export" onClick={clearSelection}>Clear</button>}</div>
      {areaError&&<p role="alert" className="error">{areaError} Choose two different corners.</p>}
      {area&&<><p><strong>{area.area.hectares.toLocaleString(undefined,{maximumFractionDigits:2})} hectares</strong> · {area.area.acres.toLocaleString(undefined,{maximumFractionDigits:2})} acres</p>
        <p>WGS84 rectangle between {area.bbox.south.toFixed(5)}° and {area.bbox.north.toFixed(5)}° latitude. Area follows parallels and meridians on the WGS84 ellipsoid.</p>
        {areaEvidenceLoading&&<p role="status">Checking five positions in soil and geology maps…</p>}
        {areaEvidenceError&&<p role="alert" className="error">{areaEvidenceError}</p>}
        {areaEvidence&&<div className="area-evidence">
          <strong>Five-point evidence check</strong>
          <p>Soil: {areaEvidence.aggregate.soil.available} mapped · {areaEvidence.aggregate.soil.noRecord} without a record · {areaEvidence.aggregate.soil.unavailable} unavailable</p>
          <p>Geology: {areaEvidence.aggregate.geology.available} mapped · {areaEvidence.aggregate.geology.noRecord} without a record · {areaEvidence.aggregate.geology.unavailable} unavailable</p>
          <p>Mapped soil units at sampled points: {areaSoilNames.join(" · ")||"none returned"}</p>
          <p>Mapped rock units at sampled points: {areaGeologyNames.join(" · ")||"none returned"}</p>
        </div>}
        <p>These are center and inset-corner point samples, not full polygon coverage. Soil and geology may vary between them.</p>
        <button className="area-export" onClick={exportArea}>⇩ Export area GeoJSON</button>
      </>}
    </section>}
    {point&&useCase==="Wellsite"&&<section className="wellsite-panel"><div className="section-heading"><div><p className="eyebrow">PUBLIC WELL RECORDS</p><h2>Nearby wells</h2></div><span className="selection-count">15 km radius</span></div><p className="wellsite-context">These locations provide regional context. A well record alone does not identify the material at the selected ground point.</p>{wellsLoading&&<p role="status" className="loading-line">Checking public well records…</p>}{wellsError&&<p role="alert" className="error">{wellsError}</p>}{wells&&!wells.wells.length&&<p>No public Utah well records returned within this search radius.</p>}{wells&&wells.wells.length>0&&<ul className="well-list">{wells.wells.map(well=><li key={well.id}><button onClick={()=>{map.current?.easeTo({center:[well.longitude,well.latitude],zoom:Math.max(map.current.getZoom(),13),duration:850});void inspectGround(well.longitude,well.latitude);}}><strong>{well.name||well.api||well.id}</strong><span>{well.distanceKm.toFixed(1)} km away · {well.status||"Status unavailable"}</span><small>{[well.operator,well.field,well.county].filter(Boolean).join(" · ")||"Operator and field unavailable"}</small></button></li>)}</ul>}{wells&&<p className="well-source">Source: <a href={wells.source.datasetUrl} target="_blank" rel="noopener noreferrer">{wells.source.organization}</a>. Locations and details reflect the public record; check the source for current status.{wells.coverage.sourceLimitReached?" Public service limit reached; some nearer wells may be omitted.":wells.coverage.truncated?" Showing the 12 closest wells returned within this radius.":""}</p>}</section>}
    {point&&<section className="source-panel">
      <div className="section-heading"><div><p className="eyebrow">SOURCE QUALITY</p><h2>What supports this view?</h2></div><span className="selection-count">Point check</span></div>
      {provenanceLoading&&<p role="status">Checking aerial scene and elevation metadata…</p>}
      {provenanceError&&<p role="alert" className="error">{provenanceError}</p>}
      {provenance&&<dl className="source-facts">
        <div><dt>Aerial scene</dt><dd>{provenance.imagery.scene?.acquisitionDate?.slice(0,10)??"Date unknown"}{provenance.imagery.scene?.resolution!=null?` · ${provenance.imagery.scene.resolution} ${provenance.imagery.scene.resolutionUnits??"units unknown"}`:" · resolution unknown"}</dd></div>
        <div><dt>USGS 3DEP point check</dt><dd>{provenance.elevation.result?.elevation!=null?`${provenance.elevation.result.elevation.toFixed(1)} m interpolated`:"Unavailable"}</dd></div>
        <div><dt>Mapterhorn tile source</dt><dd>Upstream DEM, posting, and vertical datum unknown at this point</dd></div>
      </dl>}
      <p className="source-note">The aerial value describes the selected catalog scene. The USGS elevation is an independent interpolated check; it is not a verified match to this map&apos;s terrain datum.</p>
      <p className="source-links"><a href="https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer" target="_blank" rel="noopener noreferrer">USGS imagery catalog ↗</a> · <a href="https://epqs.nationalmap.gov/" target="_blank" rel="noopener noreferrer">USGS elevation service ↗</a></p>
    </section>}
    {useCase==="Wellsite"&&<section className="core-panel">
      <div className="section-heading"><div><p className="eyebrow">PUBLIC RESEARCH CORE</p><h2>{CORE_MANIFEST.records[0].wellName}</h2></div><span className="selection-count">UGS</span></div>
      <p>{CORE_MANIFEST.records[0].formation} · {CORE_MANIFEST.records[0].county} County, Utah.</p>
      <div className="core-depth-track"><span>20 ft</span><div title="Published cored interval: 20–1,006 ft"><i/><button className="core-marker" aria-label="Inspect Mahogany bed near 460 feet" aria-expanded={coreObservationOpen} style={{left:`${(CORE_MANIFEST.records[0].observations[0].approximateDepthFeet-20)/(1006-20)*100}%`}} onClick={()=>setCoreObservationOpen(!coreObservationOpen)}>◆</button></div><span>1,006 ft</span></div>
      {coreObservationOpen&&<p className="core-observation"><strong>{CORE_MANIFEST.records[0].observations[0].label} · about {CORE_MANIFEST.records[0].observations[0].approximateDepthFeet} ft</strong><br/>{CORE_MANIFEST.records[0].observations[0].description} <a href={CORE_MANIFEST.records[0].observations[0].sourceUrl} target="_blank" rel="noopener noreferrer">UGS source ↗</a></p>}
      <p>The published log reports a cored interval of 20–1,006 ft. Its depth axis is in feet; the source does not identify measured depth, true vertical depth, or a datum.</p>
      <div className="core-links">{CORE_MANIFEST.records[0].assets.map(asset=><a key={asset.id} href={asset.url} target="_blank" rel="noopener noreferrer">{asset.title} ↗</a>)}</div>
      <p className="well-source">Regional Uinta Basin reference only. This core is not linked to the selected point or nearby well records; its exact map coordinate has not been validated.</p>
    </section>}
    {useCase==="Wellsite"&&<section className="log-panel"><div className="section-heading"><div><p className="eyebrow">LOCAL WELL LOG</p><h2>Inspect a depth curve</h2></div><span className="selection-count">LAS 2.0</span></div><p>Open a LAS file from your computer. It stays in this browser session; no upload occurs. Its identity and depth reference are not verified against nearby public wells.</p><label className="log-import" htmlFor="las-file">Choose LAS file<input id="las-file" type="file" accept=".las,text/plain" onChange={importLog}/></label>{logError&&<p role="alert" className="error">{logError}</p>}{localLog&&<><p><strong>{logName}</strong> · {localLog.rows.length.toLocaleString()} rows · depth in {localLog.depthUnit}</p><label htmlFor="log-curve">Curve</label><select id="log-curve" value={logCurve} onChange={event=>setLogCurve(Number(event.target.value))}>{localLog.curves.map((curve,index)=><option key={`${curve.mnemonic}-${index}`} value={index}>{curve.mnemonic} {curve.unit?`(${curve.unit})`:""}</option>)}</select>{logPreview?<div className="log-chart"><div><span>{logPreview.minDepth} {localLog.depthUnit}</span><svg viewBox="0 0 160 180" role="img" aria-label={`${localLog.curves[logCurve]?.mnemonic||"Selected curve"} versus source-reported depth`}><path d={logPreview.path} fill="none" stroke="#157e83" strokeWidth="2" strokeLinejoin="round"/></svg><span>{logPreview.maxDepth} {localLog.depthUnit}</span></div><small>{logPreview.minValue.toPrecision(4)}–{logPreview.maxValue.toPrecision(4)} {localLog.curves[logCurve]?.unit||"source units"}</small></div>:<p>No values were recorded for this curve.</p>}<p>{localLog.depthIssues.length?`${localLog.depthIssues.length} duplicate or direction-changing depth rows flagged. `:""}Depth reference (MD/TVD) and vertical datum are unknown; verify them before correlating this log with a core or another well.</p><button className="mini-export" onClick={()=>{setLocalLog(null);setLogName("");setLogError("");}}>Clear local log</button></>}</section>}
    {soil&&soil.horizons.length>0&&<section className="horizon-dashboard"><div className="section-heading"><div><p className="eyebrow">SOIL PROFILE</p><h2>{useCase} depth profile</h2></div><span className="selection-count">{soil.horizons.length} layers</span></div><div className="horizon-list">{soil.horizons.map((horizon,index)=><article key={horizon.key}><div className="horizon-swatch" style={{opacity:Math.max(.35,1-index*.1)}}/><div><strong>{horizon.name||`Layer ${index+1}`}</strong><span>{horizon.topCm??"?"}–{horizon.bottomCm??"?"} cm · {horizon.texture||"Texture not rated"}</span></div><dl>{horizonMetrics(horizon).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>)}</div></section>}
    {point&&<section className="report-export"><div><p className="eyebrow">FIELD REPORT</p><h2>Take this survey with you.</h2><p>Export the selected point, available soil, geology, nearby well records, and their sources. Missing evidence remains explicit.</p></div><div className="survey-export-actions"><button className="export-button" onClick={()=>exportSurvey("html")}>⇩ Printable survey</button><button onClick={()=>exportSurvey("geojson")}>GeoJSON</button><button onClick={()=>exportSurvey("json")}>JSON</button>{soil&&<button onClick={exportSoilReport}>Soil profile</button>}</div></section>}
    <section className="coverage"><label><input type="checkbox" checked={overtureEnabled} onChange={event=>{setOvertureEnabled(event.target.checked);setBuildings(true);}}/> Overture building detail · trial</label>{buildingStatus&&<p role="status">{buildingStatus}</p>}<p>Soils: USDA NRCS Soil Data Access / SSURGO. Terrain: Mapterhorn and source contributors; contours: Mapzen and source contributors. U.S. aerial imagery: USGS, USDA, The National Map. Geology: Macrostrat and original survey authors. Coverage and detail vary.</p></section>
  </aside><div className="map-shell"><div ref={container} className="map" aria-label="Interactive 3D terrain survey"/>{!ready&&!mapError&&<div className="map-message" role="status">Loading 3D terrain…</div>}{layerStatus&&<div className="layer-status" role="status">{layerStatus}</div>}{sceneLoading&&<div className="scene-loading" role="status">Loading elevation and imagery…</div>}{mapError&&<div className="map-message error" role="alert">{mapError}<button onClick={()=>setMapError("")}>×</button></div>}<div className="mode-chip"><span>{mode} · {mode==="GLOBE"?"GLOBAL":displaySurface.toUpperCase()}</span><strong>{mode==="GLOBE"?"Global overview":"Orbit the terrain and inspect the ground"}</strong><small className="map-context" aria-live="polite">Map center · {mapContext}</small></div><div className="camera-tools"><button disabled={!ready} className="primary-camera" aria-pressed={selecting&&!areaMode} onClick={()=>selecting&&!areaMode?setSelectionMode(false):beginSelection("point")}>{selecting&&!areaMode?"× Cancel point":"⌖ Select ground"}</button><button disabled={!ready} aria-pressed={selecting&&areaMode} onClick={()=>selecting&&areaMode?setSelectionMode(false):beginSelection("area")}>{selecting&&areaMode?"× Cancel area":"▱ Select area"}</button>{selecting&&!areaMode&&zoom>=12&&<button onClick={selectCenter}>Inspect map center</button>}{point&&<button onClick={returnToSelection}>↩ Selection</button>}<button disabled={!ready} aria-pressed={zoom<4.5} aria-label="World view, keep this location centered" onClick={()=>navigateToScale("world")}>◎ World</button><button disabled={!ready} aria-pressed={zoom>=4.5&&zoom<9} aria-label="Regional view, keep this location centered" onClick={()=>navigateToScale("region")}>◫ Region</button><button disabled={!ready} aria-pressed={zoom>=9} aria-label="Ground view, keep this location centered" onClick={()=>navigateToScale("ground")}>◢ Ground</button></div>{point&&<button className="selection-summary" onClick={()=>{inspector.current?.scrollIntoView({behavior:"smooth",block:"start"});inspector.current?.focus({preventScroll:true});}}><span>Selected {point[1].toFixed(5)}, {point[0].toFixed(5)} · {soilLoading?"Reading soil survey…":soil?soil.mapUnitName:soilError?"Soil lookup unavailable":"No mapped soil at this point"}</span><strong>View details ↓</strong></button>}<div className={`map-help${selecting?" selecting":""}`} role="status">{selecting?(zoom<12?"Click an area to move closer. Esc cancels.":areaMode?(areaAwaiting?"Click the opposite corner to complete the area. Esc cancels.":"Click the first corner of an area. Esc cancels."):"Click ground to inspect it, or inspect the map center. Esc cancels."):"Drag to pan · Right-drag to tilt · Click to inspect"}</div></div></div></main>;
}
