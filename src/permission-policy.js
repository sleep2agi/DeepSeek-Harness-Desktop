/**
 * The upstream page and its plugins are untrusted. No Chromium permission is granted
 * implicitly; a future capability needs an explicit reviewed allowlist.
 *
 * @param {{setPermissionRequestHandler: (handler: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) => void, setPermissionCheckHandler: (handler: (...args: unknown[]) => boolean) => void}} session
 */
export function installDefaultDenyPermissions(session) {
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}
