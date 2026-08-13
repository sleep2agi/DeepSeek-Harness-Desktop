#!/usr/bin/env node
/**
 * Fails the build if anything that should not be published is about to be.
 *
 * This exists because self-review does not scale: the things that leak into an open
 * repository are exactly the ones nobody thought to look for — a default endpoint left in
 * a config, a private registry in a lockfile, a token pasted into a fixture. A mechanical
 * check catches the ones a person skims past.
 *
 * Scans the working tree *and* the committed history, since rewriting a file does not
 * remove what an earlier commit still contains.
 *
 * @module tools/scan-leaks
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Patterns that must not appear in published content.
 *
 * @type {ReadonlyArray<{name: string, pattern: RegExp}>}
 */
const FORBIDDEN = Object.freeze([
  // Credentials, in the shapes that get pasted by accident.
  { name: 'GitHub personal access token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { name: 'GitHub classic token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'provider API key', pattern: /\bsk-[A-Za-z0-9]{32,}/ },
  { name: 'AWS access key id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },

  // Non-public infrastructure. A private registry in a lockfile is the classic one: it
  // publishes an internal hostname and makes the repository un-installable for everyone
  // outside the network that hosts it.
  { name: 'private npm registry', pattern: /registry\s*=\s*https?:\/\/(?!registry\.npmjs\.org)/ },
  { name: 'RFC1918 address', pattern: /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/ },
])

/** Paths whose contents are not ours to police. */
const SKIP = [/^resources\/kernel\//, /^node_modules\//, /^release\//, /^assets\/.*\.(png|ico|icns)$/]

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** @returns {string[]} */
function trackedFiles() {
  return git(['ls-files'])
    .split('\n')
    .filter((path) => path !== '')
    .filter((path) => !SKIP.some((skip) => skip.test(path)))
}

/** @type {string[]} */
const findings = []

for (const path of trackedFiles()) {
  /** @type {string} */
  let content
  try {
    content = readFileSync(resolve(repoRoot, path), 'utf8')
  } catch {
    continue // Binary or unreadable; nothing to match against.
  }

  for (const { name, pattern } of FORBIDDEN) {
    const match = pattern.exec(content)
    if (match !== null) {
      const line = content.slice(0, match.index).split('\n').length
      findings.push(`${path}:${line}: ${name}`)
    }
  }
}

// History matters as much as the current tree: a secret removed in a later commit is
// still served by every clone of the repository.
try {
  // Validate the candidate's reachable history. Unrelated local/remote refs are not part
  // of the commit being proposed and would make results depend on checkout state.
  const history = git(['log', 'HEAD', '-p', '--no-color', '--diff-filter=AM'])
  for (const { name, pattern } of FORBIDDEN) {
    if (pattern.test(history)) findings.push(`git history: ${name}`)
  }
} catch {
  console.warn('scan-leaks: history scan skipped (no commits yet)')
}

if (findings.length > 0) {
  console.error('scan-leaks found content that must not be published:\n')
  for (const finding of findings) console.error(`  ${finding}`)
  console.error('\nRemove it from the working tree, and rewrite history if it was ever committed.')
  process.exit(1)
}

console.log('scan-leaks: clean')
