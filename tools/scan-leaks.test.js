import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { scanRepository } from './scan-leaks.js'

const roots = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-leak-scan-'))
  roots.push(root)
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-b', 'main')
  git('config', 'user.name', 'Boundary Test')
  git('config', 'user.email', 'boundary@example.test')
  writeFileSync(join(root, 'README.md'), 'public\n')
  git('add', 'README.md')
  git('commit', '-m', 'clean main')
  git('update-ref', 'refs/remotes/pull-audit/1', 'HEAD')
  return { root, git }
}

describe('scanRepository public history', () => {
  it('finds a leak reachable only from another public branch', () => {
    const { root, git } = fixture()
    git('switch', '-c', 'leaked')
    writeFileSync(join(root, 'endpoint.txt'), `http://${[192, 168, 7, 9].join('.')}/\n`)
    git('add', 'endpoint.txt')
    git('commit', '-m', 'branch-only bytes')
    const leaked = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    git('switch', 'main')
    git('update-ref', 'refs/remotes/origin/leaked', leaked)
    assert.ok(scanRepository(root).includes('git history: RFC1918 address'))
  })

  it('finds a private identity reachable only from a pull-request ref', () => {
    const { root, git } = fixture()
    git('switch', '-c', 'private-pr')
    writeFileSync(join(root, 'identity.txt'), `${['tm', 'work'].join('')}\n`)
    git('add', 'identity.txt')
    git('commit', '-m', 'private PR bytes')
    const leaked = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    git('switch', 'main')
    git('update-ref', 'refs/remotes/pull-audit/2', leaked)
    assert.ok(scanRepository(root).includes('pull-request history: private organization or product identity'))
  })

  it('fails closed when history cannot be enumerated', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-not-a-repo-'))
    roots.push(root)
    assert.throws(() => scanRepository(root))
  })
})
