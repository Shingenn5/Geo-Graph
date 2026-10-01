"use client";
import { useEffect, useState } from "react";
import { createRectangleSelection, type RectangleSelection } from "../lib/selection/geometry";

const STORAGE_KEY = "geo-graph-saved-areas-v1";
type SavedArea = { id: string; name: string; corners: [[number, number], [number, number]] };

export default function AreaLibrary({ area, onOpen }: { area: RectangleSelection | null; onOpen: (area: RectangleSelection) => void }) {
  const [items, setItems] = useState<SavedArea[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(stored)) return;
      const valid = stored.filter((item): item is SavedArea => {
        if (!item || typeof item.id !== "string" || typeof item.name !== "string" || !Array.isArray(item.corners) || item.corners.length !== 2) return false;
        return item.corners.every((corner: unknown) => Array.isArray(corner) && corner.length === 2 && corner.every(value => typeof value === "number" && Number.isFinite(value)))
          && createRectangleSelection(item.corners[0], item.corners[1]).ok;
      });
      // Hydrate the local collection after mounting; no server-side storage access.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(valid);
    } catch { /* Storage disabled or an invalid collection: keep the map usable. */ }
  }, []);
  function write(next: SavedArea[]) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setItems(next); return true; }
    catch { setMessage("Browser storage is full or unavailable. Export your area to keep a copy."); return false; }
  }
  function save() {
    if (!area) return;
    const { west, south, east, north } = area.bbox;
    const label = name.trim() || `Area at ${south.toFixed(3)}, ${west.toFixed(3)}`;
    if (write([...items, { id: crypto.randomUUID(), name: label, corners: [[west, south], [east, north]] }])) {
      setMessage(`Saved ${label}.`); setName("");
    }
  }
  return <section className="coverage saved-area-library">
    <p className="eyebrow">MULTI-COUNTRY WORKSPACE</p><h2>Saved areas</h2>
    <p>Keep areas from different countries and reopen each one for a fresh evidence check. Stored in this browser; export reports to share or back them up.</p>
    {area&&<><label htmlFor="saved-area-name">Area name</label><input id="saved-area-name" maxLength={120} value={name} placeholder="e.g. Nigeria · northern site" onChange={event=>setName(event.target.value)}/><button onClick={save}>Save selected area</button></>}
    {!items.length&&<p>Select an area anywhere on the map to start your collection.</p>}
    {items.map(item=><div className="saved-area-row" key={item.id}><button onClick={()=>{const result=createRectangleSelection(...item.corners);if(result.ok)onOpen(result.selection);}}>{item.name}</button><button aria-label={`Remove ${item.name}`} onClick={()=>write(items.filter(saved=>saved.id!==item.id))}>Remove</button></div>)}
    {message&&<p role="status">{message}</p>}
  </section>;
}
