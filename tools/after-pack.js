/**
 * electron-builder `afterPack` hook: place the kernel beside the asar archive.
 *
 * The kernel is copied here rather than through `extraResources` because
 * electron-builder runs its own dependency-tree logic over anything named
 * `node_modules` and skips it during the resource copy — the destination directory is
 * created, and arrives empty. A build that "succeeded" then produces an application that
 * cannot find its kernel, which surfaces only when someone installs and runs it.
 *
 * It also has to live outside the asar: files inside an asar archive cannot be spawned as
 * a process.
 *
 * The copy is read back before the hook returns. A packaging step that silently produces
 * nothing is precisely the failure this replaces, so it is not repeated here in a new form.
 *
 * @module tools/after-pack
 */

import { cp, readdir, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Chromium UI locales to keep.
 *
 * These translate Chromium's own surfaces — context menus, network error pages — not the
 * application, whose interface is served by the kernel. Electron ships every locale it
 * supports, which is tens of megabytes for strings almost no installation will read.
 */
const KEEP_LOCALES = new Set(['en-US', 'zh-CN'])

/**
 * @param {{appOutDir: string, packager: {platform: {name: string}, appInfo: {productFilename: string}}}} context
 * @returns {Promise<void>}
 */
export default async function afterPack(context) {
  const source = join(repoRoot, 'resources', 'kernel')
  const isMac = context.packager.platform.name === 'mac'
  const resourcesDir = isMac
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  const destination = join(resourcesDir, 'kernel')

  await assertPresent(source, 'the kernel is not installed — run "npm run kernel:install"')

  console.log(`  • copying kernel  from=${source} to=${destination}`)
  await cp(source, destination, { recursive: true, force: true })

  // npm writes .bin shims as absolute links into the *source* tree. Copied
  // into the .app they still point at the build machine, and codesign
  // --verify --deep fails with "invalid destination for symbolic link".
  // The shell invokes lib/bin.js directly, so the shims are unused.
  await rm(join(destination, 'node_modules', '.bin'), { recursive: true, force: true })
  console.log('  • dropped kernel node_modules/.bin (absolute npm shims cannot be signed)')

  // Read back the one file the application actually spawns.
  const binPath = join(destination, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  await assertPresent(binPath, `the kernel entry point is missing from the package at ${binPath}`)

  // Windows and macOS ship a bundled Node; Linux still falls back to the system
  // runtime. A packaged Mac build without `node` would silently run the kernel
  // under Electron-as-Node, which is the configuration this project exists to
  // avoid.
  if (isMac || context.packager.platform.name === 'windows') {
    const nodeName = isMac ? 'node' : 'node.exe'
    const nodePath = join(destination, nodeName)
    await assertPresent(nodePath, `the bundled Node runtime is missing from the package at ${nodePath}`)
  }

  console.log('  • kernel copied and verified')

  await pruneLocales(isMac ? join(resourcesDir, '..', 'Resources') : context.appOutDir)
}

/**
 * Removes Chromium locale files the application will not use.
 *
 * @param {string} appDir
 * @returns {Promise<void>}
 */
async function pruneLocales(appDir) {
  const localesDir = join(appDir, 'locales')

  /** @type {string[]} */
  let entries
  try {
    entries = await readdir(localesDir)
  } catch {
    return // No locales directory on this platform layout.
  }

  let removed = 0
  let bytes = 0

  for (const entry of entries) {
    if (extname(entry) !== '.pak') continue
    if (KEEP_LOCALES.has(basename(entry, '.pak'))) continue

    const path = join(localesDir, entry)
    try {
      bytes += (await stat(path)).size
      await rm(path, { force: true })
      removed += 1
    } catch {
      // Leaving one behind costs space, not correctness.
    }
  }

  console.log(
    `  • pruned ${removed} locale files, ${(bytes / 1024 / 1024).toFixed(1)} MB` +
      ` (kept ${[...KEEP_LOCALES].join(', ')})`,
  )
}

/**
 * @param {string} path
 * @param {string} message
 * @returns {Promise<void>}
 */
async function assertPresent(path, message) {
  try {
    await stat(path)
  } catch {
    throw new Error(message)
  }
}
