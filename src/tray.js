/**
 * System tray management for macOS.
 *
 * @module tray
 */

import { Tray, Menu, nativeImage, Notification, app } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** @type {Tray | null} */
let tray = null

/** @type {import('electron').BrowserWindow | null} */
let mainWindowRef = null

/**
 * Get the correct path to the icon, handling both dev and packaged scenarios.
 * @returns {string}
 */
function getIconPath() {
  if (app.isPackaged) {
    // In packaged app, extraResources puts files in Contents/Resources/
    return join(process.resourcesPath, 'assets', 'icon.png')
  }
  return join(here, '..', 'assets', 'icon.png')
}

/**
 * @param {import('electron').BrowserWindow} window
 */
export function createTray(window) {
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
