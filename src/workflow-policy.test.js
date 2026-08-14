import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  findUnpinnedUses,
  findUses,
  isPinnedGithubAction,
  parsePinnedGithubAction,
} from './workflow-policy.js'

const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'

describe('isPinnedGithubAction', () => {
  it('accepts a github-owned action pinned to a full commit SHA', () => {
    assert.equal(isPinnedGithubAction(CHECKOUT), true)
    assert.deepEqual(parsePinnedGithubAction(CHECKOUT), {
      action: 'actions/checkout',
      sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
    })
  })

  it('rejects a tag ref — that is what makes CI die at startup', () => {
    // sha_pinning_required rejects @v4 before any job is scheduled.
    assert.equal(isPinnedGithubAction('actions/checkout@v4'), false)
    assert.equal(isPinnedGithubAction('actions/setup-node@v4.4.0'), false)
    assert.equal(isPinnedGithubAction('actions/checkout@main'), false)
  })

  it('rejects a third-party action even when SHA-pinned', () => {
    // The allow-list is github-owned only. A SHA on softprops/* still fails startup.
    assert.equal(
      isPinnedGithubAction('softprops/action-gh-release@6cbd405e2c4e67a21c47fa9e383d020e4e28b836'),
      false,
    )
  })

  it('rejects a shortened SHA rather than treating it as pinned', () => {
    assert.equal(isPinnedGithubAction('actions/checkout@3d3c42e'), false)
  })
})

describe('findUses', () => {
  it('reads both mapping and list forms, and ignores a trailing comment', () => {
    const text = [
      'jobs:',
      '  check:',
      '    steps:',
      `      - uses: ${CHECKOUT} # v7.0.1`,
      '      - uses: "actions/setup-node@v4"',
      '        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    ].join('\n')

    assert.deepEqual(findUses(text), [
      { line: 4, value: CHECKOUT },
      { line: 5, value: 'actions/setup-node@v4' },
      { line: 6, value: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02' },
    ])
  })

  it('reports every unpinned uses: so a tag cannot hide next to a SHA', () => {
    const text = [`      - uses: ${CHECKOUT}`, '      - uses: actions/checkout@v4'].join('\n')
    const unpinned = findUnpinnedUses(text)
    assert.deepEqual(unpinned, [{ line: 2, value: 'actions/checkout@v4' }])
  })
})

describe('committed workflows', () => {
  it('pin every uses: to a github-owned action SHA, so CI can actually start', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'workflows')
    const files = readdirSync(dir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    assert.ok(files.length > 0, 'expected workflow files under .github/workflows')

    /** @type {string[]} */
    const findings = []
    for (const name of files) {
      const text = readFileSync(join(dir, name), 'utf8')
      for (const { line, value } of findUnpinnedUses(text)) {
        findings.push(`${name}:${line}: ${value}`)
      }
    }

    assert.deepEqual(findings, [], `unpinned or non-github actions:\n${findings.join('\n')}`)
  })
})
