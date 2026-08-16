import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { resolveTrayIconPath, shouldHideOnClose } from './tray.js'

describe('resolveTrayIconPath', () => {
  it('uses extraResources layout when packaged', () => {
    assert.equal(
      resolveTrayIconPath({
        isPackaged: true,
        resourcesPath: '/App.app/Contents/Resources',
        projectRoot: '/repo',
      }),
      '/App.app/Contents/Resources/assets/icon.png',
    )
  })

  it('uses the repo assets folder when unpackaged', () => {
    assert.equal(
      resolveTrayIconPath({
        isPackaged: false,
        resourcesPath: '/unused',
        projectRoot: '/repo',
      }),
      '/repo/assets/icon.png',
    )
  })
})

describe('shouldHideOnClose', () => {
  it('hides on macOS when the user is not quitting', () => {
    assert.equal(shouldHideOnClose({ isQuitting: false, platform: 'darwin' }), true)
  })

  it('does not hide when quitting so the kernel can stop', () => {
    assert.equal(shouldHideOnClose({ isQuitting: true, platform: 'darwin' }), false)
  })

  it('does not hide on Windows or Linux', () => {
    assert.equal(shouldHideOnClose({ isQuitting: false, platform: 'win32' }), false)
    assert.equal(shouldHideOnClose({ isQuitting: false, platform: 'linux' }), false)
  })
})
