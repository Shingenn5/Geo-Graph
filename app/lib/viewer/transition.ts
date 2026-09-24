/** The latest request owns the commit. Cancellation never commits old coverage. */
export class TransitionGate {
  private generation = 0;
  begin() { return ++this.generation; }
  current(generation: number) { return generation === this.generation; }
  cancel() { this.generation++; }
}

/** Idle alone is not evidence of imagery coverage. Used by the MapLibre transition. */
export function hasLayerCoverage(sources: string[], viewKey: string, evidence: Map<string,string>, isLoaded: (source:string)=>boolean) {
  return sources.every(source=>evidence.get(source)===viewKey&&isLoaded(source));
}
