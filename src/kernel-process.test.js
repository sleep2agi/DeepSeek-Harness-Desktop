import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { buildSpawnOptions } from './kernel-process.js'

describe('buildSpawnOptions', () => {
  const base = { cwd: '/tmp/work', env: { PATH: '/usr/bin' } }

  it('detaches on Unix so stop() can signal the process group', () => {
    const darwin = buildSpawnOptions({ ...base, platform: 'darwin' })
    assert.equal(darwin.detached, true)
    assert.deepEqual(darwin.stdio, ['ignore', 'pipe', 'pipe'])

    const linux = buildSpawnOptions({ ...base, platform: 'linux' })
    assert.equal(linux.detached, true)
  })

  it('does not detach on Windows, where taskkill /T walks the tree by PID', () => {
    // detached:true on Windows would also open a console window for the child.
    const win = buildSpawnOptions({ ...base, platform: 'win32' })
    assert.equal(win.detached, false)
    assert.equal(win.windowsHide, true)
  })

  it('keeps stdio piped so the log buffer can read what the kernel prints', () => {
    // detached:true plus stdio:'ignore' would work, and would be the obvious
    // pairing, but then unexpected-exit diagnostics would be empty.
    const options = buildSpawnOptions({ ...base, platform: 'darwin' })
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe'])
  })
})
