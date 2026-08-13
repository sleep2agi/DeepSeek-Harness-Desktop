/**
 * Window and navigation security policy.
 *
 * The renderer loads a full web UI served by the kernel, and that UI decides for itself
 * what it renders — so this module treats the loaded page as untrusted and states, in one
 * place, exactly where it may navigate and what it may hand to the OS.
 *
 * Everything here is a pure function over strings, which is what lets the decisions be
 * tested directly rather than inferred from a running window.
 *
 * @module window-policy
 */

/**
 * Web preferences applied to every window.
 *
 * Frozen deliberately: these are the difference between "a page in a sandbox" and "a page
 * with Node". Written inline at each `BrowserWindow` call site, one of them eventually
 * gets flipped during a debugging session and silently stays flipped.
 *
 * @type {Readonly<{sandbox: boolean, contextIsolation: boolean, nodeIntegration: boolean, webviewTag: boolean, webSecurity: boolean, allowRunningInsecureContent: boolean}>}
 */
export const SECURE_WEB_PREFERENCES = Object.freeze({
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
})

/**
 * Parses a URL, returning null instead of throwing.
 *
 * @param {string} url
 * @returns {URL | null}
 */
function parse(url) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * The origin the kernel serves on, e.g. `http://127.0.0.1:41235`.
 *
 * @param {string} host
 * @param {number} port
 * @returns {string}
 */
export function kernelOrigin(host, port) {
  // A bare IPv6 address has to be bracketed before it is a valid URL authority.
  const authority = host.includes(':') ? `[${host}]` : host
  return `http://${authority}:${port}`
}

/**
 * Decides whether the window may navigate to `url`.
 *
 * Compared as an exact origin. The tempting shortcuts are all wrong in a way that only
 * shows up under attack: `startsWith('http://127.0.0.1:')` also matches port 8080 run by
 * some other program on this machine, and `includes('127.0.0.1')` matches
 * `http://evil.example/?redirect=127.0.0.1`.
 *
 * @param {string} url - the target URL, as reported by the navigation event
 * @param {string} allowedOrigin - the origin returned by {@link kernelOrigin}
 * @returns {boolean}
 */
export function isAllowedNavigation(url, allowedOrigin) {
  const target = parse(url)
  if (target === null) return false
  return target.origin === allowedOrigin
}

/**
 * Decides whether `url` may be handed to the OS to open in the user's browser.
 *
 * Restricted to http/https because `shell.openExternal` is a general-purpose "ask the OS
 * to handle this" call: `file:` opens local content, and on Windows a registered scheme
 * can launch an arbitrary program. The page choosing the URL is not ours.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedExternal(url) {
  const target = parse(url)
  if (target === null) return false
  return target.protocol === 'http:' || target.protocol === 'https:'
}

/**
 * Classifies a window-open request into the action the shell should take.
 *
 * @param {string} url
 * @param {string} allowedOrigin
 * @returns {'same-window' | 'external' | 'deny'}
 */
export function classifyWindowOpen(url, allowedOrigin) {
  if (isAllowedNavigation(url, allowedOrigin)) return 'same-window'
  if (isAllowedExternal(url)) return 'external'
  return 'deny'
}
