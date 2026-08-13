#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")
const { execFileSync } = require("node:child_process")
const { TextDecoder } = require("node:util")

const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"])
const PRIVATE_IDENTITY_PATTERN = new RegExp([
  ["tian", "ma"].join(""),
  ["tm", "work"].join(""),
  ["tm", "code"].join(""),
  ["agent", "portal"].join("[-_]?"),
  ["cli", "aab9eabbceba9cca"].join("_"),
  "\\u5929\\u9a6c",
].join("|"), "iu")
const RULES = Object.freeze([
  ["synthetic-private-product-marker", new RegExp(["PRIVATE", "PRODUCT", "MARKER", "DO", "NOT", "SHIP"].join("_"), "i")],
  ["private-product-identity", PRIVATE_IDENTITY_PATTERN],
  ["credential-assignment", /\b(?:api[_-]?key|app[_-]?secret|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*["']?[^\s"'${}]{8,}/i],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i],
  ["private-network-url", /https?:\/\/(?:localhost|(?:[^/]*\.)?(?:internal|corp|lan)|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2})(?::\d+)?(?:\/|\b)/i],
  ["windows-user-path", /[A-Za-z]:[\\/]users[\\/][^\\/\s]+[\\/]/i],
  ["unix-user-path", /\/(?:home|users)\/[^/\s]+\//i],
])

const decoder = new TextDecoder("utf-8", { fatal: true })

function decodeText(bytes) {
  try {
    const text = decoder.decode(bytes)
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return undefined
    return text
  } catch { return undefined }
}

function scanEntries(entries) {
  const findings = []
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase()
    const text = entry.bytes ? decodeText(entry.bytes) : entry.text
    if (!TEXT_EXTENSIONS.has(ext) || typeof text !== "string") {
      findings.push({ file: entry.name, rule: "unknown-tracked-binary-surface" })
      continue
    }
    if (PRIVATE_IDENTITY_PATTERN.test(entry.name)) findings.push({ file: entry.name, rule: "private-product-identity-in-path" })
    for (const [rule, pattern] of RULES) {
      if (pattern.test(text)) findings.push({ file: entry.name, rule })
    }
  }
  return findings
}

function trackedEntries(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  const names = output.toString("utf8").split("\0").filter(Boolean).sort()
  if (names.length === 0) throw new Error("tracked-enumeration-empty")
  const entries = names.map((name) => ({ name, bytes: execFileSync("git", ["show", `:${name}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) }))
  const history = execFileSync("git", ["log", "-z", "--format=%H%x09%an%x09%ae%x09%cn%x09%ce%x09%B"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
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
