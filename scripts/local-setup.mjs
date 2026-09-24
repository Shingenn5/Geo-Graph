import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import net from "node:net";

export const root = fileURLToPath(new URL("../", import.meta.url));
const receipt = path.join(root, ".sites-runtime/local-install.json");
const required = ["vinext/dist/cli.js", "wrangler/bin/wrangler.js", "cesium/Build/Cesium/Assets/approximateTerrainHeights.json", "maplibre-gl/dist/maplibre-gl-worker.mjs"];

export function supportedNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}
export function fingerprint() {
  return createHash("sha256").update(readFileSync(path.join(root, "package-lock.json"))).update(readFileSync(path.join(root, "package.json"))).update(`${process.versions.node}:${process.platform}:${process.arch}`).digest("hex");
}
export function installationReady() {
  try {
    return JSON.parse(readFileSync(receipt, "utf8")).fingerprint === fingerprint()
      && required.every(file => existsSync(path.join(root, "node_modules", file)))
      && existsSync(path.join(root, "public/cesium/Widgets/widgets.css"));
  } catch { return false; }
}
export function runNpm(args) {
  if (!process.env.npm_execpath) throw new Error("Run this command through npm or the Windows launchers.");
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed. Check the message above, then rerun npm run setup.`);
}
export function checkLocalPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error("Port 5173 is already in use. Close the other Geo Graph window before setup or launch, or use npm run dev -- --port 5174.")));
    probe.listen(5173, "127.0.0.1", () => probe.close(resolve));
  });
}
export async function setup() {
  if (!supportedNode()) throw new Error(`Node ${process.versions.node} is too old. Install Node.js 22.13 or newer, then reopen this window.`);
  await checkLocalPort();
  mkdirSync(path.dirname(receipt), { recursive: true });
  const lock = path.join(root, ".sites-runtime/local-setup.lock");
  let handle;
  try { handle = openSync(lock, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw new Error("Cannot write setup state. Extract the project into a writable folder.");
    throw new Error("Setup is already running. If it was interrupted, close its window and remove .sites-runtime/local-setup.lock before retrying.");
  }
  try {
    rmSync(receipt, { force: true });
    console.log("Geo Graph setup: installing locked dependencies. Internet access is required on first setup.");
    runNpm(["run", "install:ci"]);
    console.log("Preparing map workers and 3D viewer assets...");
    await import("./sync-map-worker.mjs");
    await import("./sync-cesium.mjs");
    writeFileSync(receipt, JSON.stringify({ fingerprint: fingerprint() }));
    console.log("Setup complete. Double-click Start Geo Graph.cmd or run npm run launch.");
  } finally { closeSync(handle); rmSync(lock, { force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes("--check")) {
      console.log(`Node.js ${process.versions.node}: ${supportedNode() ? "OK" : "22.13 or newer required"}`);
      console.log(`Dependencies and map assets: ${installationReady() ? "ready" : "setup needed; run npm run setup"}`);
      process.exitCode = supportedNode() && installationReady() ? 0 : 1;
    } else await setup();
  } catch (error) { console.error(`\nSetup stopped: ${error.message}`); process.exitCode = 1; }
}
