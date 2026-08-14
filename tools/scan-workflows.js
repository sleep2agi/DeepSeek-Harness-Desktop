#!/usr/bin/env node
/**
 * Fails the build if a workflow would be rejected by the repository's
 * Actions policy before any job starts.
 *
 * `sha_pinning_required` plus a github-owned-only allow-list means
 * `uses: actions/checkout@v4` and `uses: softprops/action-gh-release@…`
 * both produce `startup_failure`. That failure never reaches `npm test`,
 * so the check has to live here and in the unit tests that read the same
 * files.
 *
 * @module tools/scan-workflows
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUnpinnedUses } from '../src/workflow-policy.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workflowsDir = join(repoRoot, '.github', 'workflows')

/** @type {string[]} */
const findings = []

let files
try {
  files = readdirSync(workflowsDir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
} catch {
  console.error(`scan-workflows: ${workflowsDir} is missing`)
  process.exit(1)
}

if (files.length === 0) {
  console.error('scan-workflows: no workflow files found')
  process.exit(1)
}

for (const name of files) {
  const text = readFileSync(join(workflowsDir, name), 'utf8')
  for (const { line, value } of findUnpinnedUses(text)) {
    findings.push(`${name}:${line}: ${value}`)
  }
}

if (findings.length > 0) {
  console.error('scan-workflows: Actions that will fail at startup (need actions/<name>@<40-char sha>):\n')
  for (const finding of findings) console.error(`  ${finding}`)
  process.exit(1)
}

console.log(`scan-workflows: ${files.length} workflow file(s) pin every uses: to a github-owned SHA`)
