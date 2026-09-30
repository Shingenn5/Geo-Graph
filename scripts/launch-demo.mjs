import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { root, supportedNode } from "./local-setup.mjs";

const port = 8789;
const url = `http://127.0.0.1:${port}`;

async function ready() {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    const health = await response.json();
    return response.ok && health.application === "geo-graph" && health.status === "ready";
  } catch { return false; }
}

function openBrowser() {
  if (process.argv.includes("--no-browser")) return;
  const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const browser = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  browser.on("error", () => console.log(`Open ${url} in your browser.`));
  browser.unref();
}

async function checkPort() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is occupied by another app. Close it, then relaunch.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}

try {
  if (!supportedNode()) throw new Error("Install Node.js 22.13 or newer, then reopen this window.");
  if (await ready()) {
    console.log(`Geo Graph is already running: ${url}`);
    openBrowser();
  } else {
    for (const file of ["dist/server/index.js", "dist/server/wrangler.json", "node_modules/wrangler/bin/wrangler.js"]) {
      if (!existsSync(path.join(root, file))) throw new Error("Prepare the demo first: npm run demo:prepare");
    }
    await checkPort();
    console.log(`Starting the Geo Graph production demo at ${url}. Keep this window open.`);
    const child = spawn(process.execPath, [
      "--import", pathToFileURL(path.join(root, "scripts/sites-env.mjs")).href,
      path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev",
      "--config", path.join(root, "dist/server/wrangler.json"), "--local",
      "--persist-to", path.join(root, ".wrangler/state"), "--ip", "127.0.0.1",
      "--inspector-port", "0", "--port", String(port),
    ], { cwd: root, stdio: "inherit", windowsHide: true });
    let exited = false;
    child.once("error", error => { exited = true; console.error(error.message); process.exitCode = 1; });
    child.once("exit", code => { exited = true; process.exitCode = code ?? 1; });
    const stop = () => { exited = true; child.kill("SIGINT"); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    let started = false;
    for (let attempt = 0; attempt < 60 && !exited; attempt++) {
      if (await ready()) { started = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (started) {
      console.log(`Geo Graph demo is ready: ${url}`);
      openBrowser();
    } else if (!exited) {
      stop();
      throw new Error("The demo server did not become ready. Check the server messages above.");
    }
  }
} catch (error) {
  console.error(`Could not start the demo: ${error.message}`);
  process.exitCode = 1;
}
