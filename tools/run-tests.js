#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"

/** @param {string} root @returns {string[]} */
function findTests(root) {
  /** @type {string[]} */
  const found = []
  /** @param {string} directory */
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(candidate)
      else if (entry.isFile() && entry.name.endsWith(".test.js")) found.push(candidate)
    }
  }
  visit(root)
  return found.sort((left, right) => left.localeCompare(right, "en"))
}

const requestedRoot = process.argv[2]
if (!requestedRoot) {
  console.error("run-tests: expected a test root")
  process.exit(2)
}

const root = path.resolve(requestedRoot)
const tests = findTests(root)
if (tests.length === 0) {
  console.error(`run-tests: discovered zero tests under ${root}`)
  process.exit(3)
}

console.log(`run-tests: discovered ${tests.length} files under ${root}`)
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" })
if (result.error) {
  console.error(`run-tests: failed to start Node: ${result.error.message}`)
  process.exit(4)
}
process.exit(result.status ?? 5)

export { findTests }
