import { spawn } from "node:child_process";
import path from "node:path";
import { root, setup, supportedNode, installationReady, checkLocalPort } from "./local-setup.mjs";

try {
  if (!supportedNode()) throw new Error("Install Node.js 22.13 or newer, then reopen this window.");
  await checkLocalPort();
  if (!installationReady()) await setup();
  const port = 5173;
  const url = `http://127.0.0.1:${port}`;
  console.log(`Starting Geo Graph at ${url}. Keep this window open; press Ctrl+C to stop.`);
  const child = spawn(process.execPath, [path.join(root, "scripts/run-framework.mjs"), "dev", "--hostname", "127.0.0.1"], { cwd: root, stdio: "inherit" });
  let exited = false;
  child.once("error", error => { exited = true; console.error(error.message); process.exitCode = 1; });
  child.once("exit", code => { exited = true; process.exitCode = code ?? 1; });
  process.on("SIGINT", () => { exited = true; child.kill("SIGINT"); });
  process.on("SIGTERM", () => { exited = true; child.kill("SIGTERM"); });
  for (let attempt = 0; attempt < 60 && !exited; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        if (!process.argv.includes("--no-browser")) {
          const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
          const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
          const browser = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
          browser.on("error", () => console.log(`Open ${url} in your browser.`));
          browser.unref();
        }
        console.log(`Geo Graph is ready: ${url}`);
        break;
      }
    } catch { /* The server may still be starting. */ }
    if (attempt === 59) console.log(`Startup is taking longer than expected. See server messages above, or open ${url}.`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} catch (error) { console.error(`\nCould not start Geo Graph: ${error.message}`); process.exitCode = 1; }
