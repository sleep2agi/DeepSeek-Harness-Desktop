import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const source = await readFile(new URL('./main.js', import.meta.url), 'utf8')

describe('main security wiring', () => {
  it('installs default-deny permissions on the production window session', () => {
    assert.match(source, /installDefaultDenyPermissions\(webContents\.session\)/)
  })

  it('assigns the window before rechecking the exact startup process', () => {
    const assigned = source.indexOf('mainWindow = window')
    const checked = source.indexOf('assertStartupRuntimeCurrent(kernel)')
    assert.ok(assigned >= 0 && checked > assigned)
  })

  it('routes before-quit through the async coordinator', () => {
    assert.match(source, /app\.on\('before-quit', createBeforeQuitHandler\(\{/)
    assert.doesNotMatch(source, /app\.on\('before-quit',[\s\S]*void shutdown\(\)/)
  })

  it('uses the identity-preserving production shutdown helper', () => {
    assert.match(source, /const shutdown = createRuntimeShutdown\(\{/)
    assert.match(source, /clearIfCurrent: \(expected\) => \{ if \(kernel === expected\) kernel = null \}/)
  })
})
