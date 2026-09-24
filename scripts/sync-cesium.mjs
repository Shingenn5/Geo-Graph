import { cpSync, mkdirSync, copyFileSync } from "node:fs";
for (const folder of ["Workers", "ThirdParty", "Assets", "Widgets"]) {
  const destination = new URL(`../public/cesium/${folder}/`, import.meta.url);
  mkdirSync(destination, { recursive: true });
  cpSync(new URL(`../node_modules/cesium/Build/Cesium/${folder}/`, import.meta.url), destination, { recursive: true });
}
copyFileSync(new URL("../node_modules/cesium/LICENSE.md", import.meta.url), new URL("../public/cesium/LICENSE.md", import.meta.url));
