import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { createBeforeQuitHandler } from './quit-coordinator.js'

describe('createBeforeQuitHandler', () => {
  it('blocks the first quit and resumes only after shutdown settles', async () => {
    /** @type {((value?: void) => void) | undefined} */
    let release
    const shutdown = new Promise((resolve) => { release = resolve })
    let prevented = 0
    let resumed = 0
    const handler = createBeforeQuitHandler({
      shutdown: () => shutdown,
      resumeQuit: () => { resumed += 1 },
    })

    handler({ preventDefault: () => { prevented += 1 } })
    handler({ preventDefault: () => { prevented += 1 } })
    assert.equal(prevented, 2)
    assert.equal(resumed, 0)

    assert.ok(release)
    release()
    await shutdown
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(resumed, 1)

    handler({ preventDefault: () => { prevented += 1 } })
    assert.equal(prevented, 2, 'the coordinator must allow the resumed quit through')
  })

  it('reports cleanup failure, remains alive, and allows an explicit retry', async () => {
    const failures = []
    let resumed = 0
    let attempts = 0
    const handler = createBeforeQuitHandler({
      shutdown: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('cleanup failed')
      },
      resumeQuit: () => { resumed += 1 },
      onFailure: (error) => failures.push(error),
    })
    handler({ preventDefault: () => undefined })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(failures.length, 1)
    assert.equal(resumed, 0, 'a failed cleanup must not permit Electron to exit')
    handler({ preventDefault: () => undefined })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(resumed, 1)
  })
})
