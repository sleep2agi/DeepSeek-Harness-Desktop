import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  nodeArchiveBinaryPath,
  nodeArchiveFolder,
  nodeBinaryName,
  nodeRuntimeKey,
} from './node-runtime.js'

const lock = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'upstream.lock.json'), 'utf8'),
)

describe('nodeRuntimeKey', () => {
  it('names the lock-file key for every platform this shell packages', () => {
    assert.equal(nodeRuntimeKey('win32', 'x64'), 'win-x64')
    assert.equal(nodeRuntimeKey('darwin', 'arm64'), 'darwin-arm64')
    assert.equal(nodeRuntimeKey('darwin', 'x64'), 'darwin-x64')
  })

  it('returns null for a pair we do not ship, rather than guessing a URL', () => {
    // A guessed `win-arm64` key would download 404 and fail the build only after
    // a network round-trip. Fail closed at the lookup.
    assert.equal(nodeRuntimeKey('win32', 'arm64'), null)
    assert.equal(nodeRuntimeKey('aix', 'ppc64'), null)
  })
})

describe('nodeBinaryName', () => {
  it('uses the .exe suffix only on Windows', () => {
    assert.equal(nodeBinaryName('win32'), 'node.exe')
    assert.equal(nodeBinaryName('darwin'), 'node')
    assert.equal(nodeBinaryName('linux'), 'node')
  })
})

describe('nodeArchiveBinaryPath', () => {
  it('reads the official archive layouts, not a single guessed filename', () => {
    assert.equal(nodeArchiveBinaryPath('node-v22.22.0-win-x64.zip'), 'node.exe')
    assert.equal(nodeArchiveBinaryPath('node-v22.22.0-darwin-arm64.tar.gz'), 'bin/node')
    assert.equal(nodeArchiveBinaryPath('node-v22.22.0-darwin-x64.tar.gz'), 'bin/node')
  })
})

describe('nodeArchiveFolder', () => {
  it('strips the compression suffix the official builds actually use', () => {
    assert.equal(nodeArchiveFolder('node-v22.22.0-win-x64.zip'), 'node-v22.22.0-win-x64')
    assert.equal(nodeArchiveFolder('node-v22.22.0-darwin-arm64.tar.gz'), 'node-v22.22.0-darwin-arm64')
  })
})

describe('upstream.lock.json nodeRuntime', () => {
  it('pins a checksummed archive for every desktop platform this shell claims to package', () => {
    for (const key of ['win-x64', 'darwin-arm64', 'darwin-x64']) {
      const target = lock.nodeRuntime?.[key]
      assert.ok(target, `missing nodeRuntime.${key}`)
      assert.equal(typeof target.archive, 'string')
      assert.equal(typeof target.sha256, 'string')
      assert.equal(target.sha256.length, 64, `${key} sha256 must be a hex SHA-256`)
      assert.match(target.sha256, /^[0-9a-f]{64}$/)
    }
  })
})
