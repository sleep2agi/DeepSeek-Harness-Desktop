#!/usr/bin/env node
/**
 * Downloads the Node runtime the kernel is bundled with.
 *
 * The kernel is not run on Electron's built-in Node. They are not the same runtime, and
 * the difference is not theoretical here: with identical configuration and an identical
 * kernel, the HMR plugin aborts startup under Electron-as-Node with
 * `--expose-internals is required for HMR service`, and starts cleanly on this build.
 * Bundling ~30 MB removes a whole class of "our runtime is not the runtime upstream tests
 * against" problems rather than waiting for the next one.
 *
 * Two read-backs, both fatal on mismatch:
 *
 *   1. The archive's SHA-256 must equal the value published in the release's
 *      SHASUMS256.txt and recorded in upstream.lock.json. A download that succeeded is not
 *      evidence that what arrived is what was asked for.
 *   2. The extracted binary must report the pinned version when asked. Whether the thing
 *      in the archive is the thing you wanted is a question only it can answer.
 *
 * @module tools/install-node
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kernelDir = join(repoRoot, 'resources', 'kernel')

async function main() {
  if (process.platform !== 'win32') {
    console.log(`install-node: no bundled runtime defined for ${process.platform}; skipping`)
    return
  }

  const lock = JSON.parse(await readFile(join(repoRoot, 'upstream.lock.json'), 'utf8'))
  const runtime = lock.nodeRuntime
  const target = runtime?.['win-x64']
  if (target === undefined) throw new Error('upstream.lock.json has no nodeRuntime.win-x64 entry')

  const destination = join(kernelDir, 'node.exe')
  if (existsSync(destination) && (await reports(destination)) === runtime.version) {
    console.log(`node ${runtime.version} already present`)
    return
  }

  const url = `https://nodejs.org/dist/${runtime.version}/${target.archive}`
  console.log(`downloading ${url}`)

  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed with ${response.status} ${response.statusText}`)
  const archive = Buffer.from(await response.arrayBuffer())

  const digest = createHash('sha256').update(archive).digest('hex')
  if (digest !== target.sha256) {
    throw new Error(
      [
        `SHA-256 mismatch for ${target.archive}`,
        `  expected: ${target.sha256}`,
        `  actual:   ${digest}`,
        'The download does not match the artefact this repository pinned.',
      ].join('\n'),
    )
  }
  console.log(`sha256 ok: ${digest}`)

  const staging = await mkdtemp(join(tmpdir(), 'dsh-node-'))
  try {
    const archivePath = join(staging, target.archive)
    await writeFile(archivePath, archive)

    // Expand-Archive is present on every supported Windows version, which avoids adding a
    // dependency for a step that runs once per build.
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${staging}' -Force`,
      ],
      { stdio: 'inherit' },
    )

    const extracted = join(staging, target.archive.replace(/\.zip$/, ''), 'node.exe')
    if (!existsSync(extracted)) throw new Error(`the archive did not contain node.exe at ${extracted}`)

    await mkdir(kernelDir, { recursive: true })
    await cp(extracted, destination, { force: true })
  } finally {
    await rm(staging, { recursive: true, force: true })
  }

  // Only node.exe is kept. npm and npx are not needed to run the kernel, and every file
  // shipped is a file that has to be accounted for.
  const reported = await reports(destination)
  if (reported !== runtime.version) {
    throw new Error(`the extracted binary reports ${reported}, but ${runtime.version} was pinned`)
  }

  console.log(`node ${runtime.version} installed and verified at resources/kernel/node.exe`)
}

/**
 * @param {string} binary
 * @returns {Promise<string>}
 */
async function reports(binary) {
  try {
    return execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

try {
  await main()
} catch (error) {
  console.error(`\ninstall-node failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
