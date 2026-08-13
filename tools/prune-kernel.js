#!/usr/bin/env node
/**
 * Removes files from the installed kernel that a running application never reads.
 *
 * An npm tree is published for developers: it carries debug symbols, source maps, the
 * TypeScript the JavaScript was built from, prebuilt binaries for every platform, and
 * documentation. None of that is executed at runtime, and all of it ships to every user.
 *
 * What is deliberately *not* removed:
 *
 * - Licences and notices, in any of their spellings. Redistributing MIT-licensed code
 *   without its licence text is a licence violation, and these are small.
 * - `package.json`, which Node's module resolution reads.
 * - Native binaries for the platform being built, and anything the kernel spawns.
 *
 * The pruning is verified by the end-to-end test, which starts the pruned kernel for
 * real. A size win that breaks startup is not a win, and a list of "surely unused"
 * extensions is an assumption until something runs.
 *
 * @module tools/prune-kernel
 */

import { readdir, rm, stat } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kernelDir = join(repoRoot, 'resources', 'kernel')

/** Extensions that exist for building or debugging, never for running. */
const DROP_EXTENSIONS = new Set([
  '.pdb', // debug symbols
  '.map', // source maps
  '.ts',
  '.mts',
  '.cts', // TypeScript sources and declarations
  '.cc',
  '.cpp',
  '.hpp', // native sources
  '.markdown',
  '.md', // documentation — see KEEP_NAMES for the exception
])

/**
 * Files kept regardless of extension.
 *
 * Matched case-insensitively against the name without its extension, because these
 * appear as LICENSE, LICENSE.md, License.txt, licence, COPYING, and NOTICE depending on
 * the package.
 */
const KEEP_NAMES = [/^licen[cs]e/i, /^copying/i, /^notice/i, /^authors/i, /^patents/i]

/**
 * Directories of prebuilt binaries for platforms this build does not target.
 *
 * Matched on the directory name, which is the convention prebuild-install and
 * node-gyp-build use (`win32-arm64`, `linux-x64`, `darwin-arm64`).
 */
/**
 * @param {string} name - the directory name
 * @param {string} platform - the platform being built for
 * @param {string} arch - the architecture being built for
 * @returns {boolean}
 */
function isForeignPrebuild(name, platform, arch) {
  if (!/^(win32|linux|darwin|android|freebsd)-/.test(name)) return false
  return name !== `${platform}-${arch}`
}

/** @type {{files: number, bytes: number}} */
const removed = { files: 0, bytes: 0 }

/**
 * @param {string} dir
 * @param {string} platform
 * @param {string} arch
 * @returns {Promise<void>}
 */
async function walk(dir, platform, arch) {
  /** @type {import('node:fs').Dirent[]} */
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (isForeignPrebuild(entry.name, platform, arch)) {
        await dropTree(path)
        continue
      }
      await walk(path, platform, arch)
      continue
    }

    if (!entry.isFile()) continue

    const extension = extname(entry.name).toLowerCase()
    if (!DROP_EXTENSIONS.has(extension)) continue

    const base = entry.name.slice(0, entry.name.length - extension.length)
    if (KEEP_NAMES.some((pattern) => pattern.test(base))) continue

    await drop(path)
  }
}

/** @param {string} path */
async function drop(path) {
  try {
    const info = await stat(path)
    await rm(path, { force: true })
    removed.files += 1
    removed.bytes += info.size
  } catch {
    // A file that cannot be removed is left in place; it costs space, not correctness.
  }
}

/** @param {string} path */
async function dropTree(path) {
  const before = await treeSize(path)
  await rm(path, { recursive: true, force: true })
  removed.files += before.files
  removed.bytes += before.bytes
}

/**
 * @param {string} path
 * @returns {Promise<{files: number, bytes: number}>}
 */
async function treeSize(path) {
  let files = 0
  let bytes = 0
  /** @type {import('node:fs').Dirent[]} */
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return { files, bytes }
  }

  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) {
      const nested = await treeSize(child)
      files += nested.files
      bytes += nested.bytes
    } else {
      try {
        bytes += (await stat(child)).size
        files += 1
      } catch {
        // ignore
      }
    }
  }
  return { files, bytes }
}

async function main() {
  const manifest = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'))
  const { platform, arch } = configuredPackageTarget(manifest, process.platform, process.arch)

  const before = await treeSize(kernelDir)
  if (before.files === 0) {
    throw new Error('resources/kernel is empty — run "npm run kernel:install" first')
  }

  await walk(join(kernelDir, 'node_modules'), platform, arch)

  const after = await treeSize(kernelDir)
  /** @param {number} bytes */
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

  console.log(
    `pruned ${removed.files} files, ${mb(removed.bytes)} MB` +
      ` (kernel ${mb(before.bytes)} MB -> ${mb(after.bytes)} MB)` +
      `, keeping ${platform}-${arch} binaries`,
  )
}

/**
 * Derive the payload identity from the package that will actually be built. The host
 * architecture is irrelevant: an ARM64 builder may still be producing an x64 package.
 * Multiple architectures must be split into separate installs rather than pruned as one.
 *
 * @param {unknown} manifest
 * @param {string} hostPlatform
 * @param {string} hostArch
 * @returns {{platform: string, arch: string}}
 */
function configuredPackageTarget(manifest, hostPlatform, hostArch) {
  if (hostPlatform !== 'win32') return { platform: hostPlatform, arch: hostArch }
  if (typeof manifest !== 'object' || manifest === null || !('build' in manifest)) {
    throw new Error('package.json has no build target')
  }
  const build = manifest.build
  if (typeof build !== 'object' || build === null || !('win' in build)) {
    throw new Error('package.json has no Windows build target')
  }
  const win = build.win
  if (typeof win !== 'object' || win === null || !('target' in win) || !Array.isArray(win.target)) {
    throw new Error('package.json has no explicit Windows target architectures')
  }
  const architectures = new Set()
  for (const target of win.target) {
    if (typeof target !== 'object' || target === null || !('arch' in target) || !Array.isArray(target.arch)) continue
    for (const arch of target.arch) if (typeof arch === 'string' && arch !== '') architectures.add(arch)
  }
  if (architectures.size !== 1) {
    throw new Error(`expected exactly one Windows package architecture, found ${architectures.size}`)
  }
  return { platform: 'win32', arch: /** @type {string} */ ([...architectures][0]) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(`\nprune-kernel failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

export { configuredPackageTarget, isForeignPrebuild, DROP_EXTENSIONS, KEEP_NAMES }
