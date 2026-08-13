/**
 * Starting and stopping the kernel child process.
 *
 * @module kernel-process
 */

import { execFile, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { LogBuffer } from './log-redact.js'

/**
 * Asks the OS for a free TCP port.
 *
 * There is an unavoidable gap between releasing the port here and the kernel binding it,
 * during which something else could take it. That is why this is not the last word: the
 * readiness probe has to see the kernel actually answering on the port before anything is
 * shown, which closes the loop on whether the request was honoured.
 *
 * @param {string} [host]
 * @returns {Promise<number>}
 */
export function findFreePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('could not determine a free port')))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

/**
 * A running kernel, or the record of one that has stopped.
 *
 * Instances are single-use: once stopped, a new one is created for the next launch. That
 * is what lets `isRunning()` mean "this launch is still the current one" — the identity
 * the readiness probe binds itself to.
 */
export class KernelProcess {
  /** @type {import('node:child_process').ChildProcess | null} */
  #child = null
  /** @type {LogBuffer} */
  #log
  /** @type {Error | null} */
  #failure = null
  #exited = false
  /** @type {number | null} */
  #exitCode = null

  /** @param {number} [logLimit] */
  constructor(logLimit = 2000) {
    this.#log = new LogBuffer(logLimit)
  }

  /**
   * Spawns the kernel.
   *
   * The Node binary is invoked directly on the kernel's entry script rather than through
   * the `dsh` shim npm writes. On Windows that shim is a `.cmd` file, and since the fix
   * for CVE-2024-27980 Node refuses to spawn one without `shell: true` — which in turn
   * would mean the command line is concatenated rather than passed as an argv, so a space
   * or an `&` in the install path would break it. Neither problem exists if the script is
   * simply handed to Node.
   *
   * @param {object} options
   * @param {string} options.nodePath - the Node binary to run the kernel with
   * @param {string[]} options.args - argument vector, from `buildKernelArgs`
   * @param {Record<string, string>} options.env - environment, from `buildKernelEnv`
   * @param {string} options.cwd - the workspace root the kernel starts in
   * @returns {void}
   */
  start({ nodePath, args, env, cwd }) {
    if (this.#child !== null) throw new Error('this kernel process was already started')

    const child = spawn(nodePath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.#child = child

    // A spawn failure surfaces here and nowhere else. It is not thrown by `spawn`, and it
    // does not reject anything — without this listener it is an unhandled error event,
    // which is exactly the shape of "the process never appeared and nothing said why".
    child.on('error', (error) => {
      this.#failure = error
      this.#exited = true
      this.#log.push(`kernel failed to start: ${error.message}`)
    })

    child.on('exit', (code, signal) => {
      this.#exited = true
      this.#exitCode = code
      this.#log.push(`kernel exited with code=${String(code)} signal=${String(signal)}`)
    })

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => this.#log.push(String(chunk)))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk) => this.#log.push(String(chunk)))
  }

  /** @returns {boolean} whether this launch is still alive */
  isRunning() {
    return this.#child !== null && !this.#exited
  }

  /** @returns {number | undefined} */
  get pid() {
    return this.#child?.pid
  }

  /** @returns {number | null} */
  get exitCode() {
    return this.#exitCode
  }

  /** @returns {Error | null} the spawn failure, if the process never started */
  get failure() {
    return this.#failure
  }

  /** @returns {string} the captured output, redacted and bounded */
  logText() {
    return this.#log.text()
  }

  /**
   * Stops the kernel and everything it started.
   *
   * The kernel spawns children of its own — tool subprocesses, workers — and killing only
   * the parent leaves those orphaned. On Windows the whole tree is taken down by PID with
   * `taskkill /T`; addressing processes by image name instead would also kill any other
   * Node process the user happens to be running.
   *
   * @param {object} [options]
   * @param {number} [options.timeoutMs] - how long to wait for a graceful exit
   * @returns {Promise<void>}
   */
  async stop({ timeoutMs = 5_000 } = {}) {
    const child = this.#child
    if (child === null || this.#exited) return

    const { pid } = child
    if (pid === undefined) return

    const exited = new Promise((resolve) => child.once('exit', resolve))

    if (process.platform === 'win32') {
      await new Promise((resolve) => {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () =>
          resolve(undefined),
        )
      })
    } else {
      // Negative pid signals the process group, so the kernel's own children go too.
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }

    await Promise.race([exited, delay(timeoutMs)])

    if (!this.#exited) {
      child.kill('SIGKILL')
      await Promise.race([exited, delay(1_000)])
    }
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    // Do not hold the event loop open purely to wait out a timeout.
    timer.unref?.()
  })
}
