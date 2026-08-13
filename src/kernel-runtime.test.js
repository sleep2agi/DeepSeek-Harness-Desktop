import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  buildKernelArgs,
  buildKernelEnv,
  isSupportedNodeVersion,
  parseNodeVersion,
} from './kernel-runtime.js'

describe('parseNodeVersion', () => {
  it('accepts the shape process.version actually has', () => {
    assert.deepEqual(parseNodeVersion('v22.15.0'), { major: 22, minor: 15, patch: 0 })
    assert.deepEqual(parseNodeVersion('24.1.2'), { major: 24, minor: 1, patch: 2 })
  })

  it('returns null for input it cannot read', () => {
    assert.equal(parseNodeVersion('unknown'), null)
    assert.equal(parseNodeVersion(''), null)
  })
})

describe('isSupportedNodeVersion', () => {
  it('accepts the first version that has zstd support and anything newer', () => {
    assert.equal(isSupportedNodeVersion('v22.15.0'), true)
    assert.equal(isSupportedNodeVersion('v22.22.0'), true)
    assert.equal(isSupportedNodeVersion('v24.18.0'), true)
  })

  it('rejects the Node bundled with older Electron', () => {
    // Electron 33 ships Node 20 — the kernel dies on a missing zlib export there.
    assert.equal(isSupportedNodeVersion('v20.18.3'), false)
  })

  it('rejects the patch version just below the cutoff', () => {
    // Off-by-one guard: 22.14.x looks close enough to pass a sloppy major-only check.
    assert.equal(isSupportedNodeVersion('v22.14.0'), false)
    assert.equal(isSupportedNodeVersion('v22.9.0'), false)
  })

  it('rejects unreadable version strings rather than assuming the best', () => {
    assert.equal(isSupportedNodeVersion('not-a-version'), false)
  })
})

describe('buildKernelArgs', () => {
  it('puts launcher flags before app flags', () => {
    const args = buildKernelArgs({ binPath: '/k/lib/bin.js', port: 41235 })
    assert.deepEqual(args, ['/k/lib/bin.js', '--profile', 'web', '--port', '41235'])

    // The launcher hands everything from the first unrecognised token onward to the app,
    // so --port must not appear before --profile.
    assert.ok(args.indexOf('--profile') < args.indexOf('--port'))
  })

  it('places each patch overlay after the profile and before the app flags', () => {
    const args = buildKernelArgs({
      binPath: '/k/lib/bin.js',
      port: 3080,
      patchFiles: ['/a.yml', '/b.yml'],
    })

    assert.deepEqual(args, [
      '/k/lib/bin.js',
      '--profile',
      'web',
      '--patch',
      '/a.yml',
      '--patch',
      '/b.yml',
      '--port',
      '3080',
    ])
    assert.ok(args.lastIndexOf('--patch') < args.indexOf('--port'))
  })

  it('uses the long form, not the `web` subcommand that rejects preceding flags', () => {
    const args = buildKernelArgs({ binPath: '/k/lib/bin.js', port: 3080, patchFiles: ['/a.yml'] })

    // `web` may only appear as the value of --profile. As the first token after the
    // script it would be the Commander subcommand, which errors out with
    // "web takes none of parent --profile, --patch, ..." as soon as a --patch precedes it.
    assert.equal(args[1], '--profile')
    assert.equal(args[2], 'web')
    assert.equal(args.indexOf('web'), 2, 'the alias must not appear anywhere else')
  })

  it('refuses a port that is not a usable TCP port', () => {
    for (const port of [0, -1, 70000, 1.5, Number.NaN]) {
      assert.throws(
        () => buildKernelArgs({ binPath: '/k/lib/bin.js', port: /** @type {number} */ (port) }),
        RangeError,
      )
    }
  })
})

describe('buildKernelEnv', () => {
  it('pins DSH_HOME to the directory this app owns', () => {
    const env = buildKernelEnv({ parentEnv: {}, dshHome: '/app/home' })
    assert.equal(env.DSH_HOME, '/app/home')
  })

  it('drops inherited DSH_* variables instead of letting them re-point the kernel', () => {
    const env = buildKernelEnv({
      parentEnv: {
        DSH_HOME: '/the/users/own/home',
        DSH_TELEMETRY_OTLP_URL: 'https://somewhere.example/v1/logs',
        dsh_lowercase: 'x',
        PATH: '/usr/bin',
      },
      dshHome: '/app/home',
    })

    assert.equal(env.DSH_HOME, '/app/home')
    assert.equal(env.DSH_TELEMETRY_OTLP_URL, undefined)
    assert.equal(env.dsh_lowercase, undefined, 'the filter must be case-insensitive')
    assert.equal(env.PATH, '/usr/bin', 'unrelated variables are still inherited')
  })

  it('states telemetry is off rather than relying on the kernel default', () => {
    const env = buildKernelEnv({ parentEnv: {}, dshHome: '/app/home' })
    assert.equal(env.DSH_TELEMETRY_MODE, 'DISABLED')
  })

  it('removes ELECTRON_RUN_AS_NODE so it cannot leak into the kernel\'s children', () => {
    const env = buildKernelEnv({
      parentEnv: { ELECTRON_RUN_AS_NODE: '1' },
      dshHome: '/app/home',
    })
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
  })

  it('sets ELECTRON_RUN_AS_NODE when the Electron binary is standing in for Node', () => {
    // Without this the Electron binary treats the script path as an application to open.
    // It does not fail loudly: the packaged app shows no window and logs nothing useful.
    const env = buildKernelEnv({
      parentEnv: {},
      dshHome: '/app/home',
      runElectronAsNode: true,
    })
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
  })

  it('lets explicit extras win over the inherited environment', () => {
    const env = buildKernelEnv({
      parentEnv: { PATH: '/usr/bin' },
      dshHome: '/app/home',
      extra: { DEEPSEEK_API_KEY: 'supplied-at-launch' },
    })
    assert.equal(env.DEEPSEEK_API_KEY, 'supplied-at-launch')
  })
})
