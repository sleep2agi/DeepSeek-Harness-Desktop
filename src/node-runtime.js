/**
 * Which bundled Node artefact to download, and what it is called on disk.
 *
 * The kernel is not run on Electron's Node. The mapping from (platform, arch)
 * to the nodejs.org archive name is therefore a load-bearing decision: a missing
 * `darwin-arm64` key is the class of failure that only shows up when someone
 * first tries to package on a Mac, so it lives here where a test can see it.
 *
 * @module node-runtime
 */

/**
 * The lock-file key for a (platform, arch) pair, or null when this shell does
 * not ship a runtime for that pair.
 *
 * @param {string} platform - `process.platform`
 * @param {string} arch - `process.arch`
 * @returns {string | null}
 */
export function nodeRuntimeKey(platform, arch) {
  /** @type {Record<string, string>} */
  const keys = {
    'win32-x64': 'win-x64',
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64',
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
  }
  return keys[`${platform}-${arch}`] ?? null
}

/**
 * The filename the extracted binary is stored as inside `resources/kernel`.
 *
 * @param {string} platform - `process.platform`
 * @returns {string}
 */
export function nodeBinaryName(platform) {
  return platform === 'win32' ? 'node.exe' : 'node'
}

/**
 * Path of the Node binary inside the extracted official archive, relative to
 * the archive's top-level folder.
 *
 * Official Windows zips put `node.exe` at the folder root; the unix tarballs
 * put it at `bin/node`.
 *
 * @param {string} archive - e.g. `node-v22.22.0-darwin-arm64.tar.gz`
 * @returns {string}
 */
export function nodeArchiveBinaryPath(archive) {
  return archive.endsWith('.zip') ? 'node.exe' : 'bin/node'
}

/**
 * The top-level folder the official archive expands to: the archive name with
 * its compression suffix removed.
 *
 * @param {string} archive
 * @returns {string}
 */
export function nodeArchiveFolder(archive) {
  return archive.replace(/\.tar\.gz$/i, '').replace(/\.tgz$/i, '').replace(/\.zip$/i, '')
}
