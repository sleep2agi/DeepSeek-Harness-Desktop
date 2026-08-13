/**
 * Builds the command line and environment used to launch the dsh kernel.
 *
 * Pure string/object construction, kept apart from the spawning itself: what we ask the
 * kernel to do is exactly the part worth asserting on, and it is unreadable once it is
 * entangled with process IO.
 *
 * @module kernel-runtime
 */

/**
 * Minimum Node version the kernel runs on.
 *
 * The kernel reaches for `zlib.createZstdDecompress`, which does not exist before
 * 22.15.0 — on an older runtime it fails at an unrelated-looking place, long after
 * launch, so the check belongs up front where the error can name the real cause.
 */
export const MIN_NODE_VERSION = Object.freeze({ major: 22, minor: 15, patch: 0 })

/**
 * Parses a `process.version` string into comparable numbers.
 *
 * @param {string} version - e.g. `v22.15.0`
 * @returns {{major: number, minor: number, patch: number} | null}
 */
export function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (match === null) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

/**
 * Whether `version` is new enough to run the kernel.
 *
 * @param {string} version - e.g. `v22.15.0`
 * @returns {boolean}
 */
export function isSupportedNodeVersion(version) {
  const parsed = parseNodeVersion(version)
  if (parsed === null) return false

  const { major, minor, patch } = MIN_NODE_VERSION
  if (parsed.major !== major) return parsed.major > major
  if (parsed.minor !== minor) return parsed.minor > minor
  return parsed.patch >= patch
}

/**
 * Builds the argument vector for `node <bin.js> ...`.
 *
 * Ordering is not cosmetic. The launcher parses only its own flags and hands the first
 * token it does not recognise, plus everything after it, to the booted app — so launcher
 * flags come first and `--port` (owned by the web app) comes last.
 *
 * `--profile web` is used rather than the shorter `web` alias: the alias is a Commander
 * subcommand and rejects launcher flags that appear before it, which makes flag order a
 * silent tripwire. The long form has no such ambiguity.
 *
 * @param {object} options
 * @param {string} options.binPath - absolute path to the kernel's `lib/bin.js`
 * @param {number} options.port - TCP port for the web app to listen on
 * @param {string[]} [options.patchFiles] - extra patch overlays, applied in order
 * @returns {string[]} arguments to pass to the Node binary
 */
export function buildKernelArgs({ binPath, port, patchFiles = [] }) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new RangeError(`port must be a valid TCP port, got ${String(port)}`)
  }

  return [
    binPath,
    '--profile',
    'web',
    ...patchFiles.flatMap((file) => ['--patch', file]),
    '--port',
    String(port),
  ]
}

/**
 * Builds the kernel's environment.
 *
 * Two things happen here, both deliberate:
 *
 * `DSH_HOME` is pinned to a directory this app owns. Sharing a home with a `dsh` the user
 * installed themselves means the two overwrite each other's configuration, and it would
 * also put their own stored credentials inside this process's reach.
 *
 * Every other inherited `DSH_*` variable is dropped. They are the kernel's own
 * configuration surface: whatever is left in the user's shell would silently re-point
 * parts of the runtime, and the resulting behaviour would not be reproducible from
 * anything the app itself records.
 *
 * @param {object} options
 * @param {NodeJS.ProcessEnv} options.parentEnv - the environment to inherit from
 * @param {string} options.dshHome - absolute path to this app's private kernel home
 * @param {Record<string, string>} [options.extra] - additional variables to set
 * @returns {Record<string, string>}
 */
export function buildKernelEnv({ parentEnv, dshHome, extra = {} }) {
  /** @type {Record<string, string>} */
  const env = {}

  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue
    if (key.toUpperCase().startsWith('DSH_')) continue
    env[key] = value
  }

  // Electron sets this so a helper process runs as plain Node. A kernel started from the
  // packaged app inherits it; leaving it set would leak into anything the kernel spawns.
  delete env.ELECTRON_RUN_AS_NODE

  env.DSH_HOME = dshHome
  // The upstream telemetry plugin defaults to DISABLED; state it anyway, so the default
  // is a property of this app rather than of whichever kernel version got bundled.
  env.DSH_TELEMETRY_MODE = 'DISABLED'

  return { ...env, ...extra }
}
