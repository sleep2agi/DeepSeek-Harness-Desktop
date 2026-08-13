const { app, BrowserWindow } = require("electron")
const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { RuntimeOwner } = require("./runtime-owner")
const { hashFile, verifyRuntime } = require("./runtime-manifest")
const { probeHarness } = require("./health-probe")

let window
let owner

function terminate(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    const timer = setTimeout(() => { try { child.kill("SIGKILL") } catch {}; resolve() }, 3_000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
    try { child.kill("SIGTERM") } catch { clearTimeout(timer); resolve() }
  })
}

async function boot() {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "preload.js") },
  })
  await window.loadFile(path.join(__dirname, "bootstrap.html"))
  window.show()
  const runtimeRoot = path.join(process.resourcesPath, "runtime")
  const inputs = JSON.parse(fs.readFileSync(path.join(runtimeRoot, "runtime-inputs.json"), "utf8"))
  const verified = verifyRuntime(runtimeRoot, inputs)
  owner = new RuntimeOwner({
    spawn: () => spawn(verified.node, [verified.entry, "web", "--host", "127.0.0.1", "--port", "0"], {
      cwd: app.getPath("userData"),
      env: { PATH: path.dirname(verified.node), DSH_HOME: path.join(app.getPath("userData"), "dsh") },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }),
    probe: (details) => probeHarness({ ...details, expectedIndexSha256: hashFile(verified.frontendIndex) }),
    terminate,
  })
  const result = await owner.start({})
  if (!result.ok) throw new Error(`runtime-start-failed:${result.reason}`)
  await window.loadURL(result.origin)
}

app.whenReady().then(boot).catch((error) => {
  if (window && !window.isDestroyed()) window.webContents.executeJavaScript(`document.querySelector('#status').textContent = ${JSON.stringify("Runtime failed to start. Close and retry.")}`)
  console.error(error)
})
app.on("before-quit", (event) => {
  if (!owner) return
  event.preventDefault()
  const stopping = owner
  owner = undefined
  stopping.stop().finally(() => app.quit())
})
