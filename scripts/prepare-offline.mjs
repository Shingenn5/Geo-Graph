import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(directory, prefix = "") {
  const result = [];
  for (const item of await readdir(directory, {withFileTypes: true})) {
    const name = `${prefix}/${item.name}`;
    if (item.isDirectory()) result.push(...await files(`${directory}/${item.name}`, name));
    else if (/\.(js|css)$/.test(item.name)) result.push(name);
  }
  return result;
}
const assets = ["/", "/viewer", "/favicon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/maplibre/maplibre-gl-worker.mjs", "/maplibre/maplibre-gl-shared.mjs", ...await files("dist/client/_next/static", "/_next/static")].sort();
const source = await readFile("public/offline-worker.js", "utf8");
const version = createHash("sha256").update(source + JSON.stringify(assets)).digest("hex").slice(0, 16);
await writeFile("dist/client/offline-worker.js", source.replace("__OFFLINE_VERSION__", version).replace("/* OFFLINE_ASSETS */ []", JSON.stringify(assets)));
console.log(`Offline app prepared: ${assets.length} files; version ${version}`);
