import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { pruneLocales } from './after-pack.js'

describe('pruneLocales', () => {
  it('counts bytes only after deletion succeeds', async () => {
    const result = await pruneLocales('fixture', {
      readdir: async () => ['en-US.pak', 'fr.pak'],
      stat: async () => ({ size: 123 }),
      rm: async () => { throw new Error('locked') },
    })
    assert.deepEqual(result, { removed: 0, bytes: 0 })
  })

  it('counts a locale that was actually removed', async () => {
    const deleted = []
    const result = await pruneLocales('fixture', {
      readdir: async () => ['en-US.pak', 'fr.pak'],
      stat: async () => ({ size: 123 }),
      rm: async (path) => { deleted.push(path) },
    })
    assert.equal(deleted.length, 1)
    assert.deepEqual(result, { removed: 1, bytes: 123 })
  })
})
