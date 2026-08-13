/**
 * End-to-end test: a real kernel, really started, really answering.
 *
 * The unit tests assert what the shell *decides*. This asserts that those decisions
 * actually launch the thing — the class of failure that only appears when a process is
 * spawned for real: a wrong argument order, an environment the kernel rejects, an entry
 * point that cannot be executed the way it is being invoked.
 *
 * Skipped, not failed, when the kernel is absent, so `npm test` stays useful before
 * `npm run kernel:install` has been run.
 *
 * @module tests/kernel-e2e
 */

import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { KernelProcess, findFreePort } from '../src/kernel-process.js'
import { buildKernelArgs, buildKernelEnv } from '../src/kernel-runtime.js'
import { httpProbe, waitForReady } from '../src/readiness.js'
import { buildShellPatch, serialisePatch } from '../src/shell-patch.js'
import { kernelOrigin } from '../src/window-policy.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binPath = join(
  repoRoot,
  'resources',
  'kernel',
  'node_modules',
  '@deepseek-ai',
  'dsh',
  'lib',
  'bin.js',
)

const kernelPresent = existsSync(binPath)
const STARTUP_BUDGET_MS = 180_000

describe(
  'kernel end-to-end',
  { skip: kernelPresent ? false : 'resources/kernel is absent — run npm run kernel:install' },
  () => {
    /** @type {string} */
    let home
    /** @type {string} */
    let workspace
    /** @type {KernelProcess | null} */
    let kernel = null
    /** @type {string} */
    let origin

    before(async () => {
      home = await mkdtemp(join(tmpdir(), 'dsh-e2e-home-'))
      workspace = await mkdtemp(join(tmpdir(), 'dsh-e2e-work-'))
    })

    after(async () => {
      if (kernel !== null) await kernel.stop()
      await rm(home, { recursive: true, force: true })
      await rm(workspace, { recursive: true, force: true })
    })

    it(
      'starts, serves HTTP, and reports ready',
      { timeout: STARTUP_BUDGET_MS + 30_000 },
      async () => {
        const port = await findFreePort()
        const args = buildKernelArgs({ binPath, port })
        const env = buildKernelEnv({ parentEnv: process.env, dshHome: home })

        kernel = new KernelProcess()
        kernel.start({ nodePath: process.execPath, args, env, cwd: workspace })

        assert.ok(kernel.pid !== undefined, 'the kernel should have a pid once spawned')

        origin = kernelOrigin('127.0.0.1', port)
        const readiness = await waitForReady({
          url: `${origin}/`,
          isCurrent: () => /** @type {KernelProcess} */ (kernel).isRunning(),
          probe: httpProbe,
          timeoutMs: STARTUP_BUDGET_MS,
        })

        assert.equal(
          readiness.ok,
          true,
          `kernel never became ready (${readiness.reason}) after ${readiness.attempts} attempts:\n${/** @type {KernelProcess} */ (kernel).logText()}`,
        )
      },
    )

    it('serves the UI document the window would load', async () => {
      const response = await fetch(`${origin}/`)
      assert.ok(response.ok, `expected a successful response, got ${response.status}`)

      const body = await response.text()
      // Enough to prove a real document came back rather than an error page from
      // something else that happened to grab the port.
      assert.ok(body.toLowerCase().includes('<!doctype html') || body.includes('<html'))
    })

    it('honours the port it was given, rather than its own default', async () => {
      // `--port` is a request; this is the read-back. The kernel's built-in default is
      // 3080, so answering on the requested port is what proves the flag was applied.
      const requested = new URL(origin).port
      assert.notEqual(requested, '3080', 'the test must not accidentally use the default port')

      const response = await fetch(`${origin}/`)
      assert.ok(response.ok)
    })

    it('accepts a shell patch overlay after the profile flag', async () => {
      // The launcher rejects `--patch` placed before the `web` subcommand, so this also
      // guards the argument order buildKernelArgs produces.
      const patchPath = join(workspace, 'shell.patch.yml')
      await writeFile(patchPath, serialisePatch(buildShellPatch({ useBrowseDirectoryPicker: true })), 'utf8')

      const port = await findFreePort()
      const args = buildKernelArgs({ binPath, port, patchFiles: [patchPath] })
      const probe = new KernelProcess()
      probe.start({
        nodePath: process.execPath,
        args: [args[0] ?? '', ...args.slice(1, -2), '--dump-config'].filter((a) => a !== '--port'),
        env: buildKernelEnv({ parentEnv: process.env, dshHome: home }),
        cwd: workspace,
      })

      // --dump-config prints the composed tree and exits; wait for it to finish.
      await new Promise((resolveWait) => setTimeout(resolveWait, 15_000))
      const output = probe.logText()
      await probe.stop()

      assert.ok(
        output.includes('directory-picker-browse') || output.includes('shell-directory-picker'),
        `the overlay should appear in the composed tree:\n${output.slice(-2000)}`,
      )
    })

    it('stops the process tree on shutdown', async () => {
      const running = /** @type {KernelProcess} */ (kernel)
      const { pid } = running
      assert.ok(pid !== undefined)

      await running.stop()
      assert.equal(running.isRunning(), false)

      // `kill(pid, 0)` throws once the process is gone; that is the read-back on stop.
      assert.throws(() => process.kill(/** @type {number} */ (pid), 0))
      kernel = null
    })
  },
)
