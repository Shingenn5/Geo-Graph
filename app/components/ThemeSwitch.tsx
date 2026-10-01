"use client";
import { useEffect, useState } from "react";

export default function ThemeSwitch() {
  const [dark,setDark]=useState(false);
  useEffect(()=>{
    // Read the preference already applied before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.dataset.theme==="dark");
    const synchronize=(event:StorageEvent)=>{
      if(event.key!=="geo-graph-theme")return;
      const next=event.newValue==="dark";
      document.documentElement.dataset.theme=next?"dark":"light";setDark(next);
    };
    window.addEventListener("storage",synchronize);
    return()=>window.removeEventListener("storage",synchronize);
  },[]);
  function toggle() {
    const next=!dark;setDark(next);
    document.documentElement.dataset.theme=next?"dark":"light";
    try {localStorage.setItem("geo-graph-theme",next?"dark":"light");} catch { /* The current page still changes when storage is disabled. */ }
  }
  return <button className="theme-switch" type="button" role="switch" aria-label="Dark mode" aria-checked={dark} onClick={toggle} title={dark?"Switch to light mode":"Switch to dark mode"}>
    <span aria-hidden="true">{dark?"☀":"☾"}</span> {dark?"Light":"Dark"}
  </button>;
}
