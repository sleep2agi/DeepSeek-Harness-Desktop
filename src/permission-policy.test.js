import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { installDefaultDenyPermissions } from './permission-policy.js'

describe('installDefaultDenyPermissions', () => {
  it('denies every request and synchronous check by default', () => {
    /** @type {((webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) | undefined} */
    let requestHandler
    /** @type {((...args: unknown[]) => boolean) | undefined} */
    let checkHandler
    installDefaultDenyPermissions({
      setPermissionRequestHandler: (handler) => { requestHandler = handler },
      setPermissionCheckHandler: (handler) => { checkHandler = handler },
    })
    assert.ok(requestHandler)
    assert.ok(checkHandler)
    for (const permission of ['media', 'notifications', 'clipboard-read', 'geolocation']) {
      /** @type {boolean | undefined} */
      let decision
      requestHandler({}, permission, (allowed) => { decision = allowed })
      assert.equal(decision, false)
      assert.equal(checkHandler({}, permission, 'https://example.test', {}), false)
    }
  })
})
