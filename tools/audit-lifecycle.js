#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const EXPECTED = new Map([
  ["@deepseek-ai/dsh-subprocess-local@0.1.0-rc.6", "deny-unix-chmod-only"],
  ["@google/genai@1.52.0", "deny-no-op"],
  ["koffi@3.1.4", "allow-required-native-selection"],
  ["node-pty@1.1.0", "allow-required-native-selection"],
  ["protobufjs@7.6.5", "deny-warning-only"],
])

function classify(entries) {
  const observed = new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry]))
  const problems = []
  for (const [identity, classification] of EXPECTED) {
    if (!observed.has(identity)) problems.push({ identity, problem: "expected-lifecycle-package-missing" })
    else observed.delete(identity)
    if (!classification.startsWith("allow-") && !classification.startsWith("deny-")) problems.push({ identity, problem: "classification-invalid" })
  }
  for (const identity of observed.keys()) problems.push({ identity, problem: "unknown-lifecycle-package" })
  return problems
}

function enumerateInstalled(root) {
  const virtualStore = path.join(root, "node_modules", ".pnpm")
  let virtualStoreStat
  try { virtualStoreStat = fs.statSync(virtualStore) } catch { throw new Error("virtual-store-missing") }
  if (!virtualStoreStat.isDirectory()) throw new Error("virtual-store-not-directory")
  const entries = new Map()
  for (const storeEntry of fs.readdirSync(virtualStore)) {
    const modules = path.join(virtualStore, storeEntry, "node_modules")
    if (!fs.existsSync(modules)) continue
    const manifests = []
    for (const name of fs.readdirSync(modules)) {
      const candidate = path.join(modules, name)
      if (name.startsWith("@")) {
        for (const scoped of fs.readdirSync(candidate)) manifests.push(path.join(candidate, scoped, "package.json"))
      } else manifests.push(path.join(candidate, "package.json"))
    }
    for (const manifest of manifests) {
      if (!fs.existsSync(manifest)) continue
      const value = JSON.parse(fs.readFileSync(manifest, "utf8"))
      const scripts = value.scripts || {}
      const lifecycle = Object.fromEntries(Object.entries(scripts).filter(([key]) => ["preinstall", "install", "postinstall"].includes(key)))
      if (Object.keys(lifecycle).length) entries.set(`${value.name}@${value.version}`, { name: value.name, version: value.version, lifecycle })
    }
  }
  if (entries.size === 0) throw new Error("lifecycle-enumeration-empty")
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function main() {
  const entries = enumerateInstalled(path.resolve(process.argv[2] || path.join(__dirname, "..", "runtime")))
  const problems = classify(entries)
  console.log(JSON.stringify({ observed: entries.length, expected: EXPECTED.size, problems }, null, 2))
  if (problems.length) process.exitCode = 1
}

if (require.main === module) main()
module.exports = { EXPECTED, classify }
