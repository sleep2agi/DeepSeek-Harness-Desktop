import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { buildShellPatch, serialisePatch } from './shell-patch.js'

describe('buildShellPatch', () => {
  it('is empty by default, so the kernel keeps its own defaults', () => {
    assert.deepEqual(buildShellPatch(), [])
  })

  it('swaps the directory picker by disabling and inserting, never by renaming', () => {
    const entries = buildShellPatch({ useBrowseDirectoryPicker: true })

    const disable = entries.find((entry) => entry.id === 'directory-picker')
    assert.ok(disable, 'the existing row must be disabled')
    assert.equal(disable.disabled, true)
    // Rewriting `name` in place does not work: the kernel treats it as a guard, and a
    // mismatched entry is skipped rather than applied.
    assert.equal(disable.name, '@deepseek-ai/dsh-host-directory-picker-auto')

    const insert = entries.find((entry) => entry.insert !== undefined)
    assert.ok(insert?.insert, 'a replacement row must be inserted')
    assert.equal(insert.insert[0]?.name, '@deepseek-ai/dsh-host-directory-picker-browse')
  })

  it('guards the disable with the implementation it was written against', () => {
    const [disable] = buildShellPatch({ useBrowseDirectoryPicker: true })
    // If upstream replaces the implementation, this entry should stop matching rather
    // than reshape a row nobody reasoned about.
    assert.ok(disable?.name?.startsWith('@deepseek-ai/'))
  })
})

describe('serialisePatch', () => {
  it('emits an empty list the kernel can parse', () => {
    assert.equal(serialisePatch([]), '[]\n')
  })

  it('emits one block per entry', () => {
    const yaml = serialisePatch([{ id: 'timer', disabled: true }])
    assert.equal(yaml, "- id: 'timer'\n  disabled: true\n")
  })

  it('emits nested inserts under their parent', () => {
    const yaml = serialisePatch([{ insert: [{ id: 'a', name: 'pkg-a' }] }])
    assert.equal(yaml, "- insert:\n    - id: 'a'\n      name: 'pkg-a'\n")
  })

  it('emits config scalars by type', () => {
    const yaml = serialisePatch([
      { id: 'x', config: { host: '127.0.0.1', port: 3080, quiet: true } },
    ])
    assert.ok(yaml.includes("'host': '127.0.0.1'"))
    assert.ok(yaml.includes("'port': 3080"))
    assert.ok(yaml.includes("'quiet': true"))
  })

  it('quotes values so they cannot be read as YAML syntax', () => {
    const yaml = serialisePatch([{ id: "it's", name: 'a: b' }])
    assert.ok(yaml.includes("id: 'it''s'"), 'a quote is doubled, not escaped')
    assert.ok(yaml.includes("name: 'a: b'"), 'a colon stays inside the scalar')
  })

  it('refuses values it has no defined encoding for', () => {
    // The kernel's config dialect evaluates `!!js` tags, so this serialiser stays a
    // closed set of shapes rather than passing arbitrary structures through.
    assert.throws(
      () => serialisePatch([{ id: 'x', config: { nested: { a: 1 } } }]),
      TypeError,
    )
    assert.throws(() => serialisePatch([{ id: 'x', config: { list: [1, 2] } }]), TypeError)
  })
})
