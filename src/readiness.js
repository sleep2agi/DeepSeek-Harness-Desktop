/**
 * Deciding when the kernel is actually ready to be shown.
 *
 * @module readiness
 */

/**
 * @typedef {object} ReadinessResult
 * @property {boolean} ok
 * @property {'ready' | 'timeout' | 'process-gone'} reason
 * @property {number} attempts
 */

/**
 * Polls until the kernel serves a real HTTP response, the process dies, or time runs out.
 *
 * Two things this deliberately does not do:
 *
 * It does not treat an open TCP port as ready. The web server binds its port during
 * startup, and a later plugin can still fail and take the process down — for that moment
 * the port accepts connections while nothing is being served, and a window pointed there
 * shows a blank page. Only a real HTTP response proves the server is answering.
 *
 * It does not poll a bare address. `isCurrent` is checked on every attempt so readiness
 * is tied to *this* launch: if the kernel died and something else on the machine took the
 * port, the probe would otherwise get a perfectly good response from a stranger's server.
 *
 * @param {object} options
 * @param {string} options.url - the URL to probe, e.g. `http://127.0.0.1:41235/`
 * @param {() => boolean} options.isCurrent - false once the launch being waited on is over
 * @param {(url: string, signal: AbortSignal) => Promise<number | null>} options.probe -
 *   resolves to an HTTP status, or null when the connection could not be made
 * @param {number} [options.timeoutMs] - wall-clock budget for the whole wait
 * @param {number} [options.intervalMs] - delay between attempts
 * @param {number} [options.attemptTimeoutMs] - per-attempt timeout
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<ReadinessResult>}
 */
export async function waitForReady({
  url,
  isCurrent,
  probe,
  timeoutMs = 90_000,
  intervalMs = 250,
  attemptTimeoutMs = 5_000,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = now() + timeoutMs
  let attempts = 0

  for (;;) {
    if (!isCurrent()) return { ok: false, reason: 'process-gone', attempts }
    if (now() >= deadline) return { ok: false, reason: 'timeout', attempts }

    attempts += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs)

    /** @type {number | null} */
    let status = null
    try {
      status = await probe(url, controller.signal)
    } catch {
      status = null // A refused connection is the normal case while starting up.
    } finally {
      clearTimeout(timer)
    }

    // Re-check after awaiting: the process may have died while this request was open, in
    // which case a successful status did not come from the kernel we are waiting on.
    if (!isCurrent()) return { ok: false, reason: 'process-gone', attempts }
    if (status !== null && isServing(status)) return { ok: true, reason: 'ready', attempts }

    if (now() >= deadline) return { ok: false, reason: 'timeout', attempts }
    await sleep(intervalMs)
  }
}

/**
 * Whether an HTTP status means the server is answering.
 *
 * 2xx and 3xx both count: the UI may redirect on first load. A 5xx does not — the port is
 * open but the app behind it is not working yet, which is exactly the state that a
 * connection-only check mistakes for success.
 *
 * @param {number} status
 * @returns {boolean}
 */
export function isServing(status) {
  return status >= 200 && status < 400
}

/**
 * Default probe: one GET, returning the status code, or null if it never connected.
 *
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<number | null>}
 */
export async function httpProbe(url, signal) {
  try {
    const response = await fetch(url, { method: 'GET', signal, redirect: 'manual' })
    return response.status
  } catch {
    return null
  }
}
