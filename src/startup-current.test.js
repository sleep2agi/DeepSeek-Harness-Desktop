import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { assertStartupRuntimeCurrent } from './startup-current.js'

describe('assertStartupRuntimeCurrent', () => {
  it('accepts only the exact launch that is still running', () => {
    assert.doesNotThrow(() => assertStartupRuntimeCurrent({ isRunning: () => true }))
    assert.throws(() => assertStartupRuntimeCurrent({ isRunning: () => false }), /exited before the window/)
    assert.throws(() => assertStartupRuntimeCurrent(null), /exited before the window/)
  })
})
