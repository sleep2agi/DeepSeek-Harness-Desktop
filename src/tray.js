/**
 * System tray management for macOS.
 *
 * Icon path and hide-vs-quit are decided here so they can be tested without a
 * real Tray. Electron APIs are loaded only when creating the tray, because this
 * module is also imported by `node --test`.
 *
 * @module tray
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireFromHere = createRequire(import.meta.url)

/** @type {import('electron').Tray | null} */
let tray = null

/** @type {import('electron').BrowserWindow | null} */
let mainWindowRef = null

/**
 * Packaged `extraResources` copies `assets/icon.png` under `Contents/Resources/assets/`.
 *
 * @param {object} options
 * @param {boolean} options.isPackaged
 * @param {string} options.resourcesPath
 * @param {string} options.projectRoot
 * @returns {string}
 */
export function resolveTrayIconPath({ isPackaged, resourcesPath, projectRoot }) {
  if (isPackaged) {
    return join(resourcesPath, 'assets', 'icon.png')
  }
  return join(projectRoot, 'assets', 'icon.png')
}

/**
 * Closing the last window on macOS hides to the tray unless we are already quitting.
 * Quit still goes through `before-quit` / `window-all-closed` and stops the kernel.
 *
 * @param {object} options
 * @param {boolean} options.isQuitting
 * @param {string} options.platform
 * @returns {boolean}
 */
export function shouldHideOnClose({ isQuitting, platform }) {
  return !isQuitting && platform === 'darwin'
}

/**
 * @returns {string}
 */
function getIconPath() {
  const { app } = electronApi()
  return resolveTrayIconPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot: join(here, '..'),
  })
}

/** @returns {typeof import('electron')} */
function electronApi() {
  return requireFromHere('electron')
}

/**
 * @param {import('electron').BrowserWindow} window
 */
export function createTray(window) {
  const { Tray, Menu, nativeImage, app } = electronApi()
  mainWindowRef = window

  // Use the app icon as tray icon
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)

  // Resize for tray (16x16 on macOS)
  const trayIcon = icon.resize({ width: 16, height: 16 })

  tray = new Tray(trayIcon)
  tray.setToolTip('DeepSeek Harness Desktop')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Window',
      click: () => {
        if (mainWindowRef && !mainWindowRef.isDestroyed()) {
          mainWindowRef.show()
          mainWindowRef.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        // Use app.quit() to trigger proper quit flow
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // Click on tray icon shows window
  tray.on('click', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      if (mainWindowRef.isVisible()) {
        mainWindowRef.focus()
      } else {
        mainWindowRef.show()
      }
    }
  })

  return tray
}

/**
 * Show a notification when a task completes.
 *
 * @param {string} title
 * @param {string} body
 */
export function showTaskNotification(title, body) {
  const { Notification } = electronApi()
  if (!Notification.isSupported()) return

  const notification = new Notification({
    title,
    body,
    silent: false,
  })

  notification.on('click', () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.show()
      mainWindowRef.focus()
    }
  })

  notification.show()
}

/**
 * Destroy the tray instance.
 */
export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
