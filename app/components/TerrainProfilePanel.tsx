"use client";

import {useState} from "react";
import DownloadLink,{useDownload} from "./DownloadLink";
import {PROFILE_DATUM,PROFILE_SOURCE,PROFILE_SOURCE_URL,profileCsv,sampleGrade,type ProfileState,type TerrainProfile} from "../lib/viewer/terrain-profile";

const distanceLabel=(metres:number)=>metres>=1000?`${(metres/1000).toFixed(2)} km`:`${Math.round(metres)} m`;
const heightLabel=(metres:number)=>`${Math.round(metres).toLocaleString()} m`;

function ProfileChart({profile,onFocus}:{profile:TerrainProfile;onFocus:(index:number)=>void}){
  const [index,setIndex]=useState(0);
  const exportFile=useDownload();
  const p=profile.samples[index],grade=sampleGrade(profile.samples,index);
  const span=Math.max(10,profile.max-profile.min);
  const x=(i:number)=>52+i/(profile.samples.length-1)*536;
  const y=(height:number)=>142-(height-profile.min)/span*108;
  const segments:string[]=[];
  let segment="";
  profile.samples.forEach((sample,i)=>{
    if(sample.elevation===null){if(segment)segments.push(segment);segment="";}
    else segment+=`${x(i)},${y(sample.elevation)} `;
  });
  if(segment)segments.push(segment);
  function choose(next:number){setIndex(next);onFocus(next);}
  function download(){
    exportFile.download(profileCsv(profile),"text/csv","geo-graph-terrain-profile.csv");
  }
  return <>
    <dl className="profile-stats"><div><dt>Distance</dt><dd>{distanceLabel(profile.distance)}</dd></div><div><dt>Lowest / highest</dt><dd>{heightLabel(profile.min)} / {heightLabel(profile.max)}</dd></div><div><dt>Sampled ascent / descent</dt><dd>↑ {heightLabel(profile.ascent)} · ↓ {heightLabel(profile.descent)}</dd></div></dl>
    <svg className="profile-chart" viewBox="0 0 620 170" role="img" aria-label={`Terrain elevation profile, ${distanceLabel(profile.distance)}, lowest ${heightLabel(profile.min)}, highest ${heightLabel(profile.max)}`}
      onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect();choose(Math.max(0,Math.min(profile.samples.length-1,Math.round(((event.clientX-rect.left)/rect.width*620-52)/536*(profile.samples.length-1)))));}}>
      <line x1="52" y1="34" x2="588" y2="34" className="profile-grid"/><line x1="52" y1="142" x2="588" y2="142" className="profile-grid"/>
      <text x="2" y="30">{Math.round(profile.min+span)} m</text><text x="2" y="139">{Math.round(profile.min)} m</text>
      {segments.map((points,i)=><polyline key={i} points={points} fill="none" stroke="#127486" strokeWidth="2.5"/>)}
      <line x1={x(index)} x2={x(index)} y1="28" y2="146" stroke="#b36c0a" strokeDasharray="4 3"/>
      {p.elevation!==null&&<circle cx={x(index)} cy={y(p.elevation)} r="4" fill="#b36c0a"/>}
      <text x="52" y="166">A · 0</text><text x="588" y="166" textAnchor="end">B · {distanceLabel(profile.distance)}</text>
    </svg>
    <label className="profile-scrubber">Explore the line<input type="range" min="0" max={profile.samples.length-1} value={index} aria-label="Profile position" aria-valuetext={`${distanceLabel(p.distance)}, ${p.elevation===null?"height unavailable":heightLabel(p.elevation)}`} onChange={event=>choose(Number(event.target.value))}/></label>
    <p className="profile-position">{distanceLabel(p.distance)} from A · {p.elevation===null?"Height unavailable":heightLabel(p.elevation)} · {grade===null?"Grade unavailable":`${grade.toFixed(1)}% sampled grade`}</p>
    {profile.validCount<profile.samples.length&&<p className="profile-warning" role="status">Partial coverage: {profile.validCount}/{profile.samples.length} heights available. Gaps are omitted from the chart and ascent/descent.</p>}
    <div className="profile-footer"><p><a href={PROFILE_SOURCE_URL} target="_blank" rel="noreferrer">{PROFILE_SOURCE}</a> · {PROFILE_DATUM}. {profile.samples.length} samples, about {Math.round(profile.spacing)} m apart. Source resolution varies; this is a terrain estimate, not a survey or route assessment.</p><button onClick={download}>Export CSV</button></div>
    <DownloadLink file={exportFile.file}/>
  </>;
}

export default function TerrainProfilePanel({state,start,clear,onFocus}:{state:ProfileState;start:()=>void;clear:()=>void;onFocus:(index:number)=>void}){
  if(state.status==="idle")return null;
  const active=state.status==="selecting"||state.status==="loading";
  return <section className="terrain-profile-panel" aria-label="Terrain profile">
    <div className="profile-heading"><h2>Terrain profile <small>A → B</small></h2><div>{!active&&<button onClick={start}>Draw again</button>}<button onClick={clear}>{active?"Cancel":"Clear profile"}</button></div></div>
    {state.status==="selecting"&&<p role="status">{state.step===1?"Click the ground to set point A.":"Click the ground to set point B."} Choose a line from 20 m to 200 km. Escape cancels.</p>}
    {state.status==="loading"&&<p role="status">Sampling terrain along your line… You can keep moving the globe.</p>}
    {state.status==="error"&&<p className="profile-warning" role="alert">{state.message}</p>}
    {state.status==="ready"&&<ProfileChart key={state.data.sampledAt} profile={state.data} onFocus={onFocus}/>}
  </section>;
}
