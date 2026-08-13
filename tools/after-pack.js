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

import { cp, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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

  // Read back the one file the application actually spawns.
  const binPath = join(destination, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  await assertPresent(binPath, `the kernel entry point is missing from the package at ${binPath}`)

  console.log('  • kernel copied and verified')
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
