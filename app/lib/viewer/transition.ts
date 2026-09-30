/** The latest request owns the commit. Cancellation never commits old coverage. */
export class TransitionGate {
  private generation = 0;
  begin() { return ++this.generation; }
  current(generation: number) { return generation === this.generation; }
  cancel() { this.generation++; }
}

type TileCoordinate = { z: number; x: number; y: number };

/** Successful tiles survive camera movement; coverage is geographic, not a camera stamp. */
export class TileCoverage {
  private sources = new Map<string, Map<string, TileCoordinate>>();
  record(source: string, tile: TileCoordinate) {
    let tiles = this.sources.get(source);
    if (!tiles) this.sources.set(source, tiles = new Map());
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    tiles.delete(key); tiles.set(key, tile);
    while (tiles.size > 256) tiles.delete(tiles.keys().next().value!);
  }
  covers(source: string, longitude: number, latitude: number, minimumLevel: number) {
    const x = (((longitude + 180) / 360) % 1 + 1) % 1;
    const radians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
    const y = Math.max(0, Math.min(1 - Number.EPSILON, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2));
    return [...(this.sources.get(source)?.values() ?? [])].some(tile =>
      tile.z >= minimumLevel && Math.floor(x * 2 ** tile.z) === tile.x && Math.floor(y * 2 ** tile.z) === tile.y);
  }
}

/** Loaded state alone can include failed tiles; require successful center coverage too. */
export function hasLayerCoverage(sources: string[], center: {lng:number;lat:number}, zoom:number, evidence: TileCoverage, isLoaded: (source:string)=>boolean) {
  const maximumLevel: Record<string, number> = {satellite:19,clarity:19,topo:16,geology:14,soilSurvey:17};
  return sources.every(source => isLoaded(source) && evidence.covers(source, center.lng, center.lat,
    Math.max(0, Math.min(Math.floor(zoom), maximumLevel[source] ?? 19))));
}
