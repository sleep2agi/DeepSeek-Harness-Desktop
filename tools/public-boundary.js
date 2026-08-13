#!/usr/bin/env node

import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { TextDecoder } from "node:util"
import { fileURLToPath } from "node:url"

/** @typedef {{ name: string, bytes?: Uint8Array, text?: string, sha256?: string }} ScanEntry */
/** @typedef {{ file: string, rule: string }} Finding */

const TEXT_EXTENSIONS = new Set(["", ".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".toml", ".ts", ".tsx", ".txt", ".yaml", ".yml"])
const REVIEWED_BINARY_SHA256 = new Map([
  ["assets/icon.ico", "297c52b9ff1db77e7ded4a49ca4d0d984c1fd2dd36381d1905560124c504f35c"],
  ["assets/icon.png", "f1997b17f3630c1683aa86f2550251edfdfe1914a2943cbb958a706dedb8b2dd"],
  ["assets/icon.svg", "3fe68d948f4275c02df1f7d6ef8f2ee834c8612468f45289e019e122ef1e5b17"],
  ["docs/images/01-home.png", "d1d070afe24635714341c6910be91bacb258dc8dad3d3a3f65ae34a75bfca646"],
  ["docs/images/02-agent-modes.png", "fe6e60c8fe43b58c164b77d73f685cb8197d4a470e7a08e5d68cc2d1e88b769b"],
  ["docs/images/03-settings-plugins.png", "4d92344e3459adb8168e13a8b631daa2e2d9b7f13d06436b1a7bc4033eb09056"],
  ["docs/images/04-settings-general.png", "65638ff784dbd3a31a631f69b0bc9a018e28379b4643a965e556fcbbbd6b9c92"],
])
const PRIVATE_IDENTITY_PATTERN = new RegExp([
  ["tian", "ma"].join(""),
  ["tm", "work"].join(""),
  ["tm", "code"].join(""),
  ["agent", "portal"].join("[-_]?"),
  ["cli", "aab9eabbceba9cca"].join("_"),
  "\\u5929\\u9a6c",
].join("|"), "iu")
/** @type {ReadonlyArray<readonly [string, RegExp]>} */
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

/** @param {Uint8Array} bytes */
function decodeText(bytes) {
  try {
    const text = decoder.decode(bytes)
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return undefined
    return text
  } catch { return undefined }
}

/** @param {ScanEntry[]} entries @returns {Finding[]} */
function scanEntries(entries) {
  /** @type {Finding[]} */
  const findings = []
  for (const entry of entries) {
    const ext = path.extname(entry.name).toLowerCase()
    const text = entry.bytes ? decodeText(entry.bytes) : entry.text
    if (!TEXT_EXTENSIONS.has(ext) || typeof text !== "string") {
      if (entry.sha256 && REVIEWED_BINARY_SHA256.get(entry.name) === entry.sha256) continue
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

/** @param {string} root @returns {ScanEntry[]} */
function trackedEntries(root) {
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  const names = output.toString("utf8").split("\0").filter(Boolean).sort()
  if (names.length === 0) throw new Error("tracked-enumeration-empty")
  /** @type {ScanEntry[]} */
  const entries = names.map((name) => {
    const bytes = execFileSync("git", ["show", `:${name}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    return { name, bytes, sha256 }
  })
  const history = execFileSync("git", ["log", "-z", "--format=%H%x09%an%x09%ae%x09%cn%x09%ce%x09%B"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (!history.trim()) throw new Error("history-enumeration-empty")
  entries.push({ name: ".git/history-metadata.txt", text: history })
  const remotes = execFileSync("git", ["remote", "-v"], { cwd: root, encoding: "utf8" })
  if (!remotes.trim()) throw new Error("remote-enumeration-empty")
  entries.push({ name: ".git/remotes.txt", text: remotes })
  return entries
}

function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(process.argv[2] || path.join(scriptDirectory, ".."))
  const entries = trackedEntries(root)
  const findings = scanEntries(entries)
  console.log(JSON.stringify({ trackedFiles: entries.length, findings }, null, 2))
  if (findings.length) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()

export { RULES, scanEntries }
