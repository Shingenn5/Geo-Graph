export const PROFILE_SAMPLE_COUNT = 129;
export const PROFILE_SOURCE = "Re:Earth / Mapterhorn terrain";
export const PROFILE_SOURCE_URL = "https://terrain.reearth.land/cesium-mesh/ellipsoid";
export const PROFILE_DATUM = "WGS84 ellipsoidal height";

export type ProfileSample = { longitude:number; latitude:number; distance:number; elevation:number|null };
export type TerrainProfile = {
  samples:ProfileSample[]; distance:number; spacing:number; level:number; sampledAt:string;
  validCount:number; min:number; max:number; ascent:number; descent:number;
};
export type ProfileState =
  | { status:"idle" }
  | { status:"selecting"; step:1|2 }
  | { status:"loading" }
  | { status:"error"; message:string }
  | { status:"ready"; data:TerrainProfile };

export function profilePlan(distance:number) {
  if(!Number.isFinite(distance)||distance<20)throw new Error("Choose points at least 20 metres apart.");
  if(distance>200_000)throw new Error("Keep profiles under 200 km. Zoom closer and choose a shorter section.");
  const spacing=distance/(PROFILE_SAMPLE_COUNT-1);
  // Match tile detail to sample spacing, with a hard ceiling on terrain detail.
  const level=Math.max(8,Math.min(14,Math.ceil(Math.log2(40_075_016/(65*Math.max(20,spacing))))));
  return {count:PROFILE_SAMPLE_COUNT,spacing,level};
}

export function summarizeProfile(samples:ProfileSample[],level:number,sampledAt=new Date().toISOString()):TerrainProfile {
  const valid=samples.filter(sample=>sample.elevation!==null&&Number.isFinite(sample.elevation));
  if(valid.length<2)throw new Error("Terrain heights are unavailable along this line. Try another area or retry later.");
  let ascent=0,descent=0;
  for(let i=1;i<samples.length;i++){
    const before=samples[i-1].elevation,after=samples[i].elevation;
    // Never invent a slope or bridge elevation totals across missing coverage.
    if(before===null||after===null||!Number.isFinite(before)||!Number.isFinite(after))continue;
    const delta=after-before;
    if(delta>0)ascent+=delta;else descent-=delta;
  }
  const distance=samples.at(-1)!.distance;
  return {samples,distance,spacing:distance/(samples.length-1),level,sampledAt,validCount:valid.length,
    min:Math.min(...valid.map(p=>p.elevation!)),max:Math.max(...valid.map(p=>p.elevation!)),ascent,descent};
}

export function sampleGrade(samples:ProfileSample[],index:number):number|null {
  const a=samples[index-1],b=samples[index];
  if(!a||!b||a.elevation===null||b.elevation===null||b.distance<=a.distance)return null;
  return 100*(b.elevation-a.elevation)/(b.distance-a.distance);
}

export function profileCsv(profile:TerrainProfile):string {
  const rows=["distance_m,longitude,latitude,elevation_m,grade_percent,vertical_reference,source,source_url,terrain_level,sampled_at"];
  profile.samples.forEach((p,index)=>rows.push([
    p.distance.toFixed(2),p.longitude.toFixed(7),p.latitude.toFixed(7),p.elevation?.toFixed(2)??"",
    sampleGrade(profile.samples,index)?.toFixed(2)??"",PROFILE_DATUM,PROFILE_SOURCE,PROFILE_SOURCE_URL,profile.level,profile.sampledAt,
  ].join(",")));
  return rows.join("\r\n");
}
