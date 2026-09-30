import * as C from "cesium";
import {profilePlan,summarizeProfile,type ProfileState} from "./terrain-profile";
import { sampleProfileTerrain } from "./profile-sampling";

/** On-demand only: one bounded sampling job, no frame loop or work during layer changes. */
export function createProfileController(viewer:C.Viewer,onState:(state:ProfileState)=>void){
  let state:ProfileState={status:"idle"};
  let start:C.Cartographic|undefined;
  let generation=0,disposed=false;
  let sampling:AbortController|undefined;
  const entities:C.Entity[]=[];
  let cursor:C.Entity|undefined;
  function update(next:ProfileState){state=next;viewer.canvas.style.cursor=next.status==="selecting"?"crosshair":"";if(!disposed)onState(next);}
  function clear(){
    sampling?.abort();sampling=undefined;
    generation++;start=undefined;
    entities.splice(0).forEach(entity=>viewer.entities.remove(entity));
    cursor=undefined;update({status:"idle"});viewer.scene.requestRender();
  }
  function endpoint(point:C.Cartographic,label:string){
    entities.push(viewer.entities.add({position:C.Cartesian3.fromRadians(point.longitude,point.latitude,point.height),
      point:{pixelSize:10,color:C.Color.GOLD,outlineColor:C.Color.BLACK,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY},
      label:{text:label,font:"bold 15px sans-serif",fillColor:C.Color.WHITE,showBackground:true,pixelOffset:new C.Cartesian2(0,-22),disableDepthTestDistance:Number.POSITIVE_INFINITY}}));
  }
  async function sample(a:C.Cartographic,b:C.Cartographic){
    const ticket=++generation;
    const controller=new AbortController();sampling=controller;
    try{
      // Reject globe-spanning/antipodal inputs before Cesium's local geodesic solver.
      if(C.Cartesian3.distance(C.Cartesian3.fromRadians(a.longitude,a.latitude),C.Cartesian3.fromRadians(b.longitude,b.latitude))>200_000)
        throw new Error("Keep profiles under 200 km. Zoom closer and choose a shorter section.");
      const path=new C.EllipsoidGeodesic(a,b);
      const plan=profilePlan(path.surfaceDistance);
      if(viewer.terrainProvider instanceof C.EllipsoidTerrainProvider)throw new Error("Elevation terrain is still loading or unavailable. Try again when terrain is ready.");
      update({status:"loading"});
      entities.push(viewer.entities.add({polyline:{positions:[C.Cartesian3.fromRadians(a.longitude,a.latitude),C.Cartesian3.fromRadians(b.longitude,b.latitude)],width:3,material:C.Color.GOLD,clampToGround:true}}));
      const positions=Array.from({length:plan.count},(_,i)=>path.interpolateUsingFraction(i/(plan.count-1)));
      const heights=await sampleProfileTerrain(viewer.terrainProvider,plan.level,positions,controller.signal);
      if(disposed||ticket!==generation)return;
      const data=summarizeProfile(heights.map((p,i)=>({longitude:C.Math.toDegrees(p.longitude),latitude:C.Math.toDegrees(p.latitude),distance:path.surfaceDistance*i/(plan.count-1),elevation:Number.isFinite(p.height)?p.height:null})),plan.level);
      update({status:"ready",data});
    }catch(error){
      if(!disposed&&ticket===generation)update({status:"error",message:error instanceof Error?error.message:"Could not sample this terrain. Try again."});
    }finally{if(sampling===controller)sampling=undefined;if(!disposed)viewer.scene.requestRender();}
  }
  function pick(point:C.Cartographic){
    if(state.status!=="selecting")return false;
    if(!start){start=C.Cartographic.clone(point);endpoint(start,"A");update({status:"selecting",step:2});}
    else{endpoint(point,"B");void sample(start,point);}
    viewer.scene.requestRender();return true;
  }
  function focus(index:number){
    if(state.status!=="ready")return;
    const p=state.data.samples[index];
    if(!p||p.elevation===null){if(cursor)cursor.show=false;viewer.scene.requestRender();return;}
    const position=C.Cartesian3.fromDegrees(p.longitude,p.latitude,p.elevation);
    if(!cursor){cursor=viewer.entities.add({position,point:{pixelSize:13,color:C.Color.CYAN,outlineColor:C.Color.BLACK,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});entities.push(cursor);}
    else{cursor.position=new C.ConstantPositionProperty(position);cursor.show=true;}
    viewer.scene.requestRender();
  }
  function onKey(event:KeyboardEvent){if(event.key==="Escape"&&(state.status==="selecting"||state.status==="loading"))clear();}
  window.addEventListener("keydown",onKey);
  return {
    start(){clear();update({status:"selecting",step:1});},
    pick,focus,clear,
    destroy(){disposed=true;clear();window.removeEventListener("keydown",onKey);},
  };
}
