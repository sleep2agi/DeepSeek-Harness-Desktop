import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { createRuntimeShutdown } from './runtime-shutdown.js'

describe('createRuntimeShutdown', () => {
  it('retains the exact runtime after failure so a retry can stop it', async () => {
    let attempts = 0
    const runtime = { stop: async () => { attempts += 1; if (attempts === 1) throw new Error('failed') } }
    /** @type {typeof runtime | null} */
    let current = runtime
    const shutdown = createRuntimeShutdown({
      getCurrent: () => current,
      clearIfCurrent: (expected) => { if (current === expected) current = null },
    })
    await assert.rejects(shutdown(), /failed/)
    assert.equal(current, runtime)
    await shutdown()
    assert.equal(attempts, 2)
    assert.equal(current, null)
  })

  it('does not clear a newer runtime identity', async () => {
    /** @type {((value?: void) => void) | undefined} */
    let release
    const old = { stop: () => new Promise((resolve) => { release = resolve }) }
    const newer = { stop: async () => undefined }
    /** @type {typeof old | typeof newer | null} */
    let current = old
    const shutdown = createRuntimeShutdown({
      getCurrent: () => current,
      clearIfCurrent: (expected) => { if (current === expected) current = null },
    })
    const pending = shutdown()
    current = newer
    assert.ok(release)
    release()
    await pending
    assert.equal(current, newer)
  })
})
