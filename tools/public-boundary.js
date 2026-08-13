#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")

const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"])
const RULES = Object.freeze([
  ["synthetic-private-product-marker", new RegExp(["PRIVATE", "PRODUCT", "MARKER", "DO", "NOT", "SHIP"].join("_"), "i")],
  ["credential-assignment", /\b(?:api[_-]?key|app[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["']?[^\s"'${}]{8,}/i],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i],
  ["private-network-url", /https?:\/\/(?:[^/]*\.)?(?:internal|corp|lan)(?::\d+)?(?:\/|\b)/i],
  ["windows-user-path", /[A-Za-z]:\\Users\\[^\\\s]+\\/i],
  ["unix-user-path", /\/(?:home|Users)\/[^/\s]+\//],
])

function scanEntries(entries) {
  const findings = []
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase()
    if (!TEXT_EXTENSIONS.has(ext)) {
      findings.push({ file: entry.name, rule: "unknown-tracked-binary-surface" })
      continue
    }
    for (const [rule, pattern] of RULES) {
      if (pattern.test(entry.text)) findings.push({ file: entry.name, rule })
    }
  }
  return findings
}

function trackedEntries(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  const names = output.toString("utf8").split("\0").filter(Boolean).sort()
  if (names.length === 0) throw new Error("tracked-enumeration-empty")
  const entries = names.map((name) => ({ name, text: fs.readFileSync(path.join(root, name), "utf8") }))
  const history = execFileSync("git", ["log", "--format=%H%x09%an%x09%ae%x09%cn%x09%ce%x09%s"], { cwd: root, encoding: "utf8" })
  if (!history.trim()) throw new Error("history-enumeration-empty")
  entries.push({ name: ".git/history-metadata.txt", text: history })
  const remotes = execFileSync("git", ["remote", "-v"], { cwd: root, encoding: "utf8" })
  if (!remotes.trim()) throw new Error("remote-enumeration-empty")
  entries.push({ name: ".git/remotes.txt", text: remotes })
  return entries
}

function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."))
  const entries = trackedEntries(root)
  const findings = scanEntries(entries)
  console.log(JSON.stringify({ trackedFiles: entries.length, findings }, null, 2))
  if (findings.length) process.exitCode = 1
}

if (require.main === module) main()

module.exports = { RULES, scanEntries }
