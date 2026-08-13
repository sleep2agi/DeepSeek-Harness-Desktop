/**
 * Electron entry point: orchestration and IO only.
 *
 * Every decision this file acts on is made in a module that can be tested without
 * Electron — what remains here is starting a process, opening a window, and wiring the
 * two together.
 *
 * @module main
 */

import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { KernelProcess, findFreePort } from './kernel-process.js'
import { buildKernelArgs, buildKernelEnv, isSupportedNodeVersion } from './kernel-runtime.js'
import { httpProbe, waitForReady } from './readiness.js'
import { buildShellPatch, serialisePatch } from './shell-patch.js'
import { writeFile } from 'node:fs/promises'
import {
  SECURE_WEB_PREFERENCES,
  classifyWindowOpen,
  isAllowedNavigation,
  kernelOrigin,
} from './window-policy.js'

const HOST = '127.0.0.1'
const here = dirname(fileURLToPath(import.meta.url))

/** @type {KernelProcess | null} */
let kernel = null
/** @type {BrowserWindow | null} */
let mainWindow = null

/**
 * Where the bundled kernel lives, packaged or not.
 *
 * `extraResources` places it beside the asar archive rather than inside it: files in an
 * asar cannot be spawned, so a kernel bundled the usual way would fail only once packaged.
 *
 * @returns {{binPath: string, nodePath: string}}
 */
function resolveKernelPaths() {
  const root = app.isPackaged ? join(process.resourcesPath, 'kernel') : join(here, '..', 'resources', 'kernel')
  const binPath = join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

  // A bundled Node is preferred when present: the kernel's dependencies are published and
  // tested against Node releases, and Electron's bundled Node is a different runtime that
  // merely resembles one.
  const bundled = join(root, process.platform === 'win32' ? 'node.exe' : 'node')
  const nodePath = existsSync(bundled) ? bundled : process.execPath

  return { binPath, nodePath }
}

/**
 * Starts the kernel and waits until it is genuinely serving.
 *
 * @returns {Promise<{origin: string}>}
 * @throws when the kernel cannot be started or never becomes ready
 */
async function startKernel() {
  const { binPath, nodePath } = resolveKernelPaths()
  if (!existsSync(binPath)) {
    throw new Error(
      `The kernel is not installed at:\n  ${binPath}\n\nRun "npm run kernel:install" first.`,
    )
  }

  // Electron's own binary answers `--version` as Electron, not as Node, so the check only
  // means something when a separate Node binary is being used.
  if (nodePath !== process.execPath && !isSupportedNodeVersion(process.version)) {
    throw new Error(`The kernel needs Node 22.15.0 or newer; this runtime is ${process.version}.`)
  }

  const dshHome = join(app.getPath('userData'), 'kernel-home')
  await mkdir(dshHome, { recursive: true })

  const patchEntries = buildShellPatch()
  /** @type {string[]} */
  const patchFiles = []
  if (patchEntries.length > 0) {
    const patchPath = join(app.getPath('userData'), 'shell.patch.yml')
    await writeFile(patchPath, serialisePatch(patchEntries), 'utf8')
    patchFiles.push(patchPath)
  }

  const port = await findFreePort(HOST)
  const args = buildKernelArgs({ binPath, port, patchFiles })
  const env = buildKernelEnv({ parentEnv: process.env, dshHome })

  const process_ = new KernelProcess()
  process_.start({ nodePath, args, env, cwd: app.getPath('home') })
  kernel = process_

  const origin = kernelOrigin(HOST, port)
  const readiness = await waitForReady({
    url: `${origin}/`,
    isCurrent: () => process_.isRunning(),
    probe: httpProbe,
  })

  if (!readiness.ok) {
    const why =
      readiness.reason === 'process-gone'
        ? 'The kernel exited during startup.'
        : 'The kernel did not start responding in time.'
    throw new Error(`${why}\n\nRecent output:\n${tail(process_.logText(), 25)}`)
  }

  return { origin }
}

/**
 * @param {string} origin
 * @returns {BrowserWindow}
 */
function createWindow(origin) {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#1b1b1f',
    title: 'DeepSeek Harness Desktop',
    icon: join(here, '..', 'assets', 'icon.png'),
    webPreferences: { ...SECURE_WEB_PREFERENCES },
  })

  // No preload is attached on purpose. The page is a web UI whose plugin set is decided
  // by the kernel and the user's configuration, not by this shell; with nothing bridged
  // into it there is no shell-provided surface for it to reach through.

  const { webContents } = window

  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, origin)) {
      event.preventDefault()
      if (classifyWindowOpen(url, origin) === 'external') void shell.openExternal(url)
    }
  })

  webContents.setWindowOpenHandler(({ url }) => {
    const action = classifyWindowOpen(url, origin)
    if (action === 'external') void shell.openExternal(url)
    // Never `allow`: a new BrowserWindow created this way would not inherit the policy
    // applied above, so kernel URLs are navigated in place instead.
    if (action === 'same-window') void webContents.loadURL(url)
    return { action: 'deny' }
  })

  // A webview can carry its own webPreferences and would bypass every setting above.
  webContents.on('will-attach-webview', (event) => event.preventDefault())

  webContents.on('render-process-gone', (_event, details) => {
    console.error(`renderer gone: ${details.reason}`)
  })

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
  })

  void window.loadURL(`${origin}/`)
  return window
}

/**
 * @param {string} text
 * @param {number} lines
 * @returns {string}
 */
function tail(text, lines) {
  return text.split('\n').slice(-lines).join('\n')
}

/** @returns {Promise<void>} */
async function shutdown() {
  const running = kernel
  kernel = null
  if (running !== null) await running.stop()
}

// A second instance would start a second kernel against the same home directory, and the
// two would overwrite each other's state.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    try {
      const { origin } = await startKernel()
      mainWindow = createWindow(origin)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('DeepSeek Harness Desktop could not start', message)
      await shutdown()
      app.exit(1)
    }
  })

  app.on('window-all-closed', async () => {
    await shutdown()
    app.quit()
  })

  // `before-quit` is the last point at which the kernel can still be stopped; without it a
  // quit triggered from the menu or the OS would leave the process tree running.
  app.on('before-quit', () => {
    void shutdown()
  })
}
