"use client";

import { useMemo, useState } from "react";
import type { ParsedWellLog } from "../lib/logs/las";
import { buildLogTrack } from "../lib/logs/plot";

const COLORS = ["#72ddba", "#e8bd77", "#83bfff"];
const number = (value: number) => Number(value.toPrecision(5)).toLocaleString();

export default function WellLogTracks({ log }: { log: ParsedWellLog }) {
  const available = log.curves.map((curve, index) => ({ curve, index })).filter(({ curve }) => curve !== log.depthCurve);
  const [curves, setCurves] = useState(() => available.slice(0, 3).map(({ index }) => index));
  const tracks = useMemo(() => curves.map(index => buildLogTrack(log, index)), [log, curves]);
  const first = tracks.find(track => track !== null);
  function choose(track: number, curve: number) {
    setCurves(current => current.map((value, index) => index === track ? curve : value));
  }
  return <div className="well-log-viewer">
    <div className="log-track-controls">{curves.map((index, track) => <label key={track}>
      <span style={{ color: COLORS[track] }}>TRACK {String(track + 1).padStart(2, "0")}</span>
      <select aria-label={`Curve for track ${track + 1}`} value={index} onChange={event => choose(track, Number(event.target.value))}>
        {available.map(({ curve, index }) => <option key={index} value={index}>{curve.mnemonic} {curve.unit ? `· ${curve.unit}` : ""}</option>)}
      </select>
    </label>)}</div>
    {first ? <div className="log-tracks" style={{ gridTemplateColumns: `44px repeat(${curves.length}, minmax(0, 1fr))` }}>
      <div className="log-depth-axis"><b>{log.depthUnit}</b><div>{Array.from({ length: 6 }, (_, index) => <span key={index} style={{ top: `${index * 20}%` }}>{number(first.minDepth + (first.maxDepth - first.minDepth) * index / 5)}</span>)}</div></div>
      {curves.map((index, track) => <div className="log-track" key={track}>
        <div className="log-range"><span>{tracks[track] ? number(tracks[track]!.minValue) : "—"}</span><b style={{ color: COLORS[track] }}>{log.curves[index].unit || "unit unknown"}</b><span>{tracks[track] ? number(tracks[track]!.maxValue) : "—"}</span></div>
        <svg viewBox="0 0 160 500" preserveAspectRatio="none" role="img" aria-label={`${log.curves[index].mnemonic} against source depth in ${log.depthUnit}; missing values are gaps`}>
          {Array.from({ length: 11 }, (_, grid) => <line key={`h${grid}`} x1="0" x2="160" y1={8 + grid * 48.4} y2={8 + grid * 48.4} className={grid % 2 ? "log-grid-minor" : "log-grid-major"} />)}
          {[0, 1, 2, 3, 4].map(grid => <line key={`v${grid}`} x1={8 + grid * 36} x2={8 + grid * 36} y1="8" y2="492" className="log-grid-minor" />)}
          {tracks[track] && <path d={tracks[track]!.path} fill="none" stroke={COLORS[track]} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        </svg>
        <small>{tracks[track] ? `${tracks[track]!.validRows.toLocaleString()} recorded values` : "No recorded values"}</small>
      </div>)}
    </div> : <p>No values were recorded for the selected curves.</p>}
    {!curves.length && <p>This file contains a depth column but no measurement curves.</p>}
    <div className="log-quality"><span>LINEAR TRACK SCALES</span><span>NULLS SHOWN AS GAPS</span><span>MD / TVD UNKNOWN</span></div>
  </div>;
}
