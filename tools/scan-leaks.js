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
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const PRIVATE_IDENTITY = new RegExp([
  ['tian', 'ma'].join(''),
  ['tm', 'work'].join(''),
  ['tm', 'code'].join(''),
  ['agent', 'portal'].join('[-_]?'),
  ['cli', 'aab9eabbceba9cca'].join('_'),
  '\\u5929\\u9a6c',
].join('|'), 'iu')

// Pull-request refs remain publicly fetchable after their source branches are deleted.
// Historical test fixtures legitimately contain synthetic private IPs and fake user
// paths, so PR history uses the non-negotiable disclosure rules rather than pretending
// those fixtures are real infrastructure. Branch history still uses every rule above.
const PR_HISTORY_FORBIDDEN = Object.freeze([
  ...FORBIDDEN.filter(({ name }) => name !== 'RFC1918 address'),
  { name: 'private organization or product identity', pattern: PRIVATE_IDENTITY },
])

/** Paths whose contents are not ours to police. */
const SKIP = [/^resources\/kernel\//, /^node_modules\//, /^release\//, /^assets\/.*\.(png|ico|icns)$/]

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args, root = repoRoot) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** @param {string} root @returns {string[]} */
function trackedFiles(root) {
  return git(['ls-files'], root)
    .split('\n')
    .filter((path) => path !== '')
    .filter((path) => !SKIP.some((skip) => skip.test(path)))
}

/** @param {string} root @returns {string[]} */
function scanRepository(root) {
  /** @type {string[]} */
  const findings = []

  for (const path of trackedFiles(root)) {
    /** @type {string} */
    let content
    try {
      content = readFileSync(resolve(root, path), 'utf8')
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
  // Every public branch is fetchable whether or not it is merged. CI first fetches and
  // proves the complete remote-head set, then this scan covers HEAD plus every origin ref.
  // A secret on an unmerged branch is already disclosed; waiting until merge is too late.
  const history = git(['log', 'HEAD', '--remotes=origin', '-p', '--no-color', '--diff-filter=AM'], root)
  for (const { name, pattern } of FORBIDDEN) {
    if (pattern.test(history)) findings.push(`git history: ${name}`)
  }
  const pullHistory = git(['log', '--remotes=pull-audit', '-p', '--no-color', '--diff-filter=AM'], root)
  for (const { name, pattern } of PR_HISTORY_FORBIDDEN) {
    if (pattern.test(pullHistory)) findings.push(`pull-request history: ${name}`)
  }
  return findings
}

function main() {
  const findings = scanRepository(repoRoot)
  if (findings.length > 0) {
    console.error('scan-leaks found content that must not be published:\n')
    for (const finding of findings) console.error(`  ${finding}`)
    console.error('\nRemove it from the working tree, and rewrite history if it was ever committed.')
    process.exitCode = 1
    return
  }
  console.log('scan-leaks: clean')
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main()

export { scanRepository }
