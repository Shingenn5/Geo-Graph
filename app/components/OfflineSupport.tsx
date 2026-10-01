"use client";
import { useEffect, useState } from "react";
import { prepareOfflineApp, downloadOfflineSite } from "../lib/viewer/offline";
import type { RectangleSelection } from "../lib/selection/geometry";

export default function OfflineSupport({area}: {area: RectangleSelection | null}) {
  const [offline,setOffline]=useState(false), [busy,setBusy]=useState(false), [message,setMessage]=useState("");
  useEffect(()=>{
    const update=()=>setOffline(!navigator.onLine);
    const download=()=>{void prepareOfflineApp().catch(()=>{});};
    // Hydrate network status after mounting.
    update();
    window.addEventListener("online",update);window.addEventListener("offline",update);
    if(document.documentElement.dataset.ggTerrainVisible)download();
    else window.addEventListener("gg-terrain-ready",download,{once:true});
    return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);window.removeEventListener("gg-terrain-ready",download);};
  },[]);
  async function save(site: boolean) {
    setBusy(true);
    try {
      if(site&&area){const result=await downloadOfflineSite(area.bbox,setMessage);setMessage(`Saved ${result.downloaded} responses, including ${result.terrainTiles} terrain tiles. ${result.unavailable} not saved. Offline terrain uses downloaded elevation; close-up views may use coarser parent tiles.`);}
      else {setMessage("Downloading app files…");await prepareOfflineApp();setMessage("App files downloaded. Save a site below before disconnecting.");}
    } catch(cause){setMessage(cause instanceof Error?cause.message:"Offline download could not finish.");}
    finally{setBusy(false);}
  }
  return <details className="workspace-help offline-support"><summary>Offline use{offline?" · disconnected":""}</summary>
    <p>Download the app and a small selected site while online. Offline terrain uses Bare Earth; satellite imagery needs a connection. Saved evidence is a snapshot, not a fresh survey.</p>
    <button disabled={busy||offline} onClick={()=>void save(false)}>Download app files</button>
    <button disabled={busy||offline||!area} onClick={()=>void save(true)}>Download selected site</button>
    {!area&&<p>Select or reopen an area to download its terrain and evidence.</p>}
    <p>Data stays in this browser, with a shared 128 MB / 1,200-response limit. Older downloads can be removed when storage fills. Download terrain covers zoom levels 0–14; new areas and finer detail need a connection.</p>
    {message&&<p role="status">{message}</p>}
  </details>;
}
