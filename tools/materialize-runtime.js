#!/usr/bin/env node

const crypto = require("node:crypto")
const fs = require("node:fs")
const https = require("node:https")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const extract = require("extract-zip")
const { hashFile, verifyRuntime } = require("../src/runtime-manifest")

const root = path.resolve(__dirname, "..")
const inputs = JSON.parse(fs.readFileSync(path.join(root, "runtime", "runtime-inputs.json"), "utf8"))
const destination = path.join(root, "resources", "runtime")

function download(url, output, redirects = 0) {
  if (redirects > 3) return Promise.reject(new Error("download-redirect-limit"))
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 30_000 }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume()
        return resolve(download(new URL(response.headers.location, url), output, redirects + 1))
      }
      if (response.statusCode !== 200) return reject(new Error(`download-http-${response.statusCode}`))
      const file = fs.createWriteStream(output, { flags: "wx" })
      response.pipe(file)
      file.once("finish", () => file.close(resolve))
      file.once("error", reject)
    })
    request.once("timeout", () => request.destroy(new Error("download-timeout")))
    request.once("error", reject)
  })
}

async function main() {
  if (fs.existsSync(destination)) throw new Error("runtime-destination-already-exists")
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-public-runtime-"))
  try {
    const archive = path.join(staging, "node.zip")
    await download(inputs.node.archiveUrl, archive)
    if (fs.statSync(archive).size !== inputs.node.archiveSize || hashFile(archive) !== inputs.node.archiveSha256) throw new Error("node-archive-mismatch")
    const runtime = path.join(staging, "runtime")
    const nodeRoot = path.join(runtime, "node")
    const dshRoot = path.join(runtime, "dsh")
    fs.mkdirSync(nodeRoot, { recursive: true })
    fs.mkdirSync(dshRoot, { recursive: true })
    await extract(archive, { dir: nodeRoot })
    fs.cpSync(path.join(root, "runtime", "package.json"), path.join(dshRoot, "package.json"), { recursive: false })
    fs.cpSync(path.join(root, "runtime", "pnpm-lock.yaml"), path.join(dshRoot, "pnpm-lock.yaml"), { recursive: false })
    fs.cpSync(path.join(root, "runtime", "pnpm-workspace.yaml"), path.join(dshRoot, "pnpm-workspace.yaml"), { recursive: false })
    if (process.platform !== "win32" || process.arch !== "x64") throw new Error("runtime-materializer-requires-win32-x64")
    const corepack = path.join(path.dirname(process.execPath), "corepack.cmd")
    const version = spawnSync(corepack, ["pnpm", "--version"], { cwd: dshRoot, encoding: "utf8", timeout: 60_000 })
    if (version.error || version.status !== 0 || version.stdout.trim() !== inputs.resolver.version) throw new Error("runtime-pnpm-version-mismatch")
    if (hashFile(path.join(dshRoot, "pnpm-lock.yaml")) !== inputs.resolver.lockSha256) throw new Error("runtime-pnpm-lock-mismatch")
    const install = spawnSync(corepack, ["pnpm", "install", "--frozen-lockfile"], { cwd: dshRoot, stdio: "inherit", timeout: 20 * 60_000 })
    if (install.error || install.status !== 0) throw new Error(`runtime-pnpm-install-failed:${install.status}`)
    for (const spec of inputs.dsh.native.files) {
      const file = path.join(dshRoot, spec.relativePath)
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`runtime-native-missing:${spec.relativePath}`)
      if (fs.statSync(file).size !== spec.size || hashFile(file) !== spec.sha256) throw new Error(`runtime-native-mismatch:${spec.relativePath}`)
    }
    fs.copyFileSync(path.join(root, "runtime", "runtime-inputs.json"), path.join(runtime, "runtime-inputs.json"))
    verifyRuntime(runtime, inputs)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.renameSync(runtime, destination)
    console.log(JSON.stringify({ result: "ok", destination, nodeSha256: inputs.node.executableSha256, dshEntrySha256: inputs.dsh.entrySha256 }))
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
