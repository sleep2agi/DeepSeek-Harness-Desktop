import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { configuredPackageTarget, isForeignPrebuild } from './prune-kernel.js'

describe('configuredPackageTarget', () => {
  /** @param {string[]} arch */
  const manifest = (arch) => ({ build: { win: { target: [{ target: 'nsis', arch }, { target: 'zip', arch }] } } })

  it('uses the package architecture rather than the build host architecture', () => {
    assert.deepEqual(configuredPackageTarget(manifest(['x64']), 'win32', 'arm64'), { platform: 'win32', arch: 'x64' })
    assert.equal(isForeignPrebuild('win32-x64', 'win32', 'x64'), false)
    assert.equal(isForeignPrebuild('win32-arm64', 'win32', 'x64'), true)
  })

  it('fails closed when the package has no single architecture', () => {
    assert.throws(() => configuredPackageTarget(manifest([]), 'win32', 'x64'), /exactly one/)
    assert.throws(() => configuredPackageTarget(manifest(['x64', 'arm64']), 'win32', 'x64'), /exactly one/)
  })

  it('preserves the host target on non-Windows package builds', () => {
    assert.deepEqual(configuredPackageTarget({}, 'linux', 'arm64'), { platform: 'linux', arch: 'arm64' })
    assert.deepEqual(configuredPackageTarget({}, 'darwin', 'x64'), { platform: 'darwin', arch: 'x64' })
  })
})
