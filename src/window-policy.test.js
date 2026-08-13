import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  classifyWindowOpen,
  isAllowedExternal,
  isAllowedNavigation,
  kernelOrigin,
  SECURE_WEB_PREFERENCES,
} from './window-policy.js'

const ORIGIN = kernelOrigin('127.0.0.1', 41235)

describe('kernelOrigin', () => {
  it('builds a plain origin with no trailing slash', () => {
    assert.equal(ORIGIN, 'http://127.0.0.1:41235')
  })

  it('brackets an IPv6 host so the result is a parseable URL', () => {
    const origin = kernelOrigin('::1', 3080)
    assert.equal(origin, 'http://[::1]:3080')
    assert.equal(new URL(origin).origin, origin)
  })
})

describe('isAllowedNavigation', () => {
  it('allows the kernel origin and its paths', () => {
    assert.equal(isAllowedNavigation('http://127.0.0.1:41235/', ORIGIN), true)
    assert.equal(isAllowedNavigation('http://127.0.0.1:41235/session/1?x=2', ORIGIN), true)
  })

  it('rejects another port on this machine', () => {
    // The `startsWith('http://127.0.0.1:')` mistake would accept this.
    assert.equal(isAllowedNavigation('http://127.0.0.1:8080/', ORIGIN), false)
  })

  it('rejects a remote URL that merely mentions the loopback address', () => {
    // The `includes('127.0.0.1')` mistake would accept both of these.
    assert.equal(isAllowedNavigation('http://evil.example/?x=127.0.0.1', ORIGIN), false)
    assert.equal(isAllowedNavigation('http://127.0.0.1.evil.example/', ORIGIN), false)
  })

  it('rejects a different scheme on the same authority', () => {
    assert.equal(isAllowedNavigation('https://127.0.0.1:41235/', ORIGIN), false)
  })

  it('rejects credentials smuggled into the authority', () => {
    assert.equal(isAllowedNavigation('http://127.0.0.1:41235@evil.example/', ORIGIN), false)
  })

  it('rejects unparseable input rather than throwing', () => {
    assert.equal(isAllowedNavigation('not a url', ORIGIN), false)
    assert.equal(isAllowedNavigation('', ORIGIN), false)
  })
})

describe('isAllowedExternal', () => {
  it('allows http and https', () => {
    assert.equal(isAllowedExternal('https://example.com/docs'), true)
    assert.equal(isAllowedExternal('http://example.com/docs'), true)
  })

  it('refuses schemes that hand local execution to the OS', () => {
    assert.equal(isAllowedExternal('file:///C:/Windows/System32/cmd.exe'), false)
    assert.equal(isAllowedExternal('javascript:alert(1)'), false)
    assert.equal(isAllowedExternal('ms-msdt:/id'), false)
    assert.equal(isAllowedExternal('data:text/html,<script>alert(1)</script>'), false)
  })
})

describe('classifyWindowOpen', () => {
  it('keeps kernel URLs in the window, sends web URLs out, denies the rest', () => {
    assert.equal(classifyWindowOpen('http://127.0.0.1:41235/a', ORIGIN), 'same-window')
    assert.equal(classifyWindowOpen('https://example.com', ORIGIN), 'external')
    assert.equal(classifyWindowOpen('file:///etc/passwd', ORIGIN), 'deny')
  })
})

describe('SECURE_WEB_PREFERENCES', () => {
  it('keeps the renderer sandboxed and without Node', () => {
    assert.equal(SECURE_WEB_PREFERENCES.sandbox, true)
    assert.equal(SECURE_WEB_PREFERENCES.contextIsolation, true)
    assert.equal(SECURE_WEB_PREFERENCES.nodeIntegration, false)
    assert.equal(SECURE_WEB_PREFERENCES.webviewTag, false)
  })

  it('is frozen, so a later edit cannot quietly weaken it', () => {
    assert.throws(() => {
      'use strict'
      // @ts-expect-error - deliberately violating the type to prove the freeze holds
      SECURE_WEB_PREFERENCES.nodeIntegration = true
    })
    assert.equal(SECURE_WEB_PREFERENCES.nodeIntegration, false)
  })
})
