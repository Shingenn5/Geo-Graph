"use client";

import { useRef } from "react";

const PANELS = ["explore", "layers", "results", "areas"] as const;
export type DashboardPanel = typeof PANELS[number];

export default function DashboardNavigation({ active, onChange, selection }: {
  active: DashboardPanel;
  onChange: (panel: DashboardPanel) => void;
  selection: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  return <div className="dashboard-navigation" role="tablist" aria-label="Survey dashboard">
    {PANELS.map((panel, index) => <button
      key={panel}
      ref={element => { buttons.current[index] = element; }}
      id={`dashboard-tab-${panel}`}
      type="button"
      role="tab"
      aria-selected={active === panel}
      aria-controls={`dashboard-panel-${panel}`}
      tabIndex={active === panel ? 0 : -1}
      onClick={() => onChange(panel)}
      onKeyDown={event => {
        let next: number;
        switch (event.key) {
          case "ArrowRight": next = (index + 1) % PANELS.length; break;
          case "ArrowLeft": next = (index + PANELS.length - 1) % PANELS.length; break;
          case "Home": next = 0; break;
          case "End": next = PANELS.length - 1; break;
          default: return;
        }
        event.preventDefault();
        onChange(PANELS[next]);
        buttons.current[next]?.focus();
      }}
    >{panel === "explore" ? "Explore" : panel === "layers" ? "Layers" : panel === "areas" ? "Areas" : "Results"}
      {panel === "results" && <span className="results-count" aria-label={selection}>{selection === "No selection" ? "—" : "1"}</span>}
    </button>)}
  </div>;
}
