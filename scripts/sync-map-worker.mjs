import { copyFileSync, mkdirSync } from 'node:fs';
const out = new URL('../public/maplibre/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(new URL(`../node_modules/maplibre-gl/dist/${name}`, import.meta.url), new URL(name, out));
}
copyFileSync(new URL('../node_modules/maplibre-gl/LICENSE.txt', import.meta.url), new URL('LICENSE.txt', out));
