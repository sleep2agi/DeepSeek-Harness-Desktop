#!/usr/bin/env node
/**
 * Installs the pinned kernel into `resources/kernel`, ready to be bundled.
 *
 * Two properties this script exists to hold:
 *
 * Install scripts are disabled. The kernel pulls in several hundred transitive packages,
 * none of which have been audited here; an install script runs arbitrary code as whoever
 * is building, which is not a thing to accept by default for a dependency that only needs
 * to sit in a directory.
 *
 * The result is read back and checked. `npm install` reporting success says the command
 * ran, not that what landed on disk is the artefact this repository pinned. The check
 * fails the build rather than warning — a warning in build output is a warning nobody
 * reads.
 *
 * @module tools/install-kernel
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kernelDir = join(repoRoot, 'resources', 'kernel')

/** @typedef {{kernel: {name: string, version: string, integrity: string, bin: string}}} UpstreamLock */

/** @returns {UpstreamLock} */
function readLock() {
  const raw = readFileSync(join(repoRoot, 'upstream.lock.json'), 'utf8')
  return /** @type {UpstreamLock} */ (JSON.parse(raw))
}

function main() {
  const { kernel } = readLock()
  const spec = `${kernel.name}@${kernel.version}`

  console.log(`installing ${spec} into resources/kernel`)

  rmSync(kernelDir, { recursive: true, force: true })
  mkdirSync(kernelDir, { recursive: true })

  // A private, versionless manifest: this directory is a payload, not a package, and
  // npm should never treat it as publishable or try to resolve a name for it.
  writeFileSync(
    join(kernelDir, 'package.json'),
    `${JSON.stringify({ name: 'dsh-kernel-payload', private: true, version: '0.0.0' }, null, 2)}\n`,
    'utf8',
  )

  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      spec,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--omit=dev',
      '--install-strategy=hoisted',
    ],
    { cwd: kernelDir, stdio: 'inherit', shell: process.platform === 'win32' },
  )

  verify(kernel)
  console.log(`kernel ${kernel.version} installed and verified`)
}

/**
 * Reads back what was installed and compares it against the lock.
 *
 * @param {UpstreamLock['kernel']} kernel
 * @returns {void}
 */
function verify(kernel) {
  const lockPath = join(kernelDir, 'package-lock.json')
  if (!existsSync(lockPath)) {
    throw new Error('npm produced no package-lock.json, so nothing can be verified')
  }

  const installed = /** @type {{packages?: Record<string, {version?: string, integrity?: string}>}} */ (
    JSON.parse(readFileSync(lockPath, 'utf8'))
  )

  const entry = installed.packages?.[`node_modules/${kernel.name}`]
  if (entry === undefined) {
    throw new Error(`${kernel.name} is absent from the installed tree`)
  }

  if (entry.version !== kernel.version) {
    throw new Error(
      `installed ${kernel.name}@${entry.version}, but upstream.lock.json pins ${kernel.version}`,
    )
  }

  if (entry.integrity !== kernel.integrity) {
    throw new Error(
      [
        `integrity mismatch for ${kernel.name}@${kernel.version}`,
        `  expected: ${kernel.integrity}`,
        `  actual:   ${String(entry.integrity)}`,
        'The registry served a different artefact than the one this repository pinned.',
      ].join('\n'),
    )
  }

  const binPath = join(kernelDir, kernel.bin)
  if (!existsSync(binPath)) {
    throw new Error(`the kernel entry point is missing at ${kernel.bin}`)
  }
}

try {
  main()
} catch (error) {
  console.error(`\ninstall-kernel failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
