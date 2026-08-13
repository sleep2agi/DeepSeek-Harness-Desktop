/**
 * The shell's configuration overlay.
 *
 * The kernel composes its plugin tree from ordered layers — each bundle's patch, then the
 * profile's, then the home-level one, then any `--patch` overlays. This module produces
 * the last of those: the preferences that belong to *this shell* rather than to the user.
 *
 * Using the overlay, rather than editing upstream files or the user's profile directory,
 * is what keeps the two separable. The user's own settings sit in an earlier layer and
 * stay theirs; upgrading the kernel does not have to be reconciled with local edits.
 *
 * @module shell-patch
 */

/**
 * A single entry in the patch list.
 *
 * `id` selects the row to change. `name` is a *guard*, not an edit: when present the
 * kernel checks it against the row it found. Naming the implementation we expect means
 * that if upstream swaps it out, this entry stops applying instead of silently reshaping
 * a row that is no longer the one we reasoned about.
 *
 * @typedef {object} PatchEntry
 * @property {string} [id]
 * @property {string} [name]
 * @property {boolean} [disabled]
 * @property {Record<string, unknown>} [config]
 * @property {PatchEntry[]} [insert]
 */

/**
 * Builds the shell's patch list.
 *
 * Kept to preferences that are genuinely the shell's business. Anything a user would
 * reasonably want to change belongs in their own configuration layer, where it will not
 * be overwritten on the next launch.
 *
 * @param {object} [options]
 * @param {boolean} [options.useBrowseDirectoryPicker] - replace the auto-selected
 *   directory picker with the non-native one. The native picker crashes on Windows in the
 *   current kernel preview; this is a temporary workaround, not a preference.
 * @returns {PatchEntry[]}
 */
export function buildShellPatch({ useBrowseDirectoryPicker = false } = {}) {
  /** @type {PatchEntry[]} */
  const entries = []

  if (useBrowseDirectoryPicker) {
    // A row's `name` cannot be rewritten — supplying a different one makes the entry a
    // mismatch rather than an edit. Swapping an implementation therefore means disabling
    // the existing row and inserting a replacement.
    entries.push({
      id: 'directory-picker',
      name: '@deepseek-ai/dsh-host-directory-picker-auto',
      disabled: true,
    })
    entries.push({
      insert: [
        {
          id: 'shell-directory-picker',
          name: '@deepseek-ai/dsh-host-directory-picker-browse',
        },
      ],
    })
  }

  return entries
}

/**
 * Serialises a patch list to YAML.
 *
 * Hand-written rather than pulled from a YAML library: the output is a small, closed set
 * of shapes, and the kernel's configuration dialect includes a `!!js` tag whose values
 * are evaluated. Emitting only what this module constructs keeps arbitrary data from
 * reaching that evaluator through this path.
 *
 * @param {PatchEntry[]} entries
 * @returns {string}
 */
export function serialisePatch(entries) {
  if (entries.length === 0) return '[]\n'
  return entries.map((entry) => emitEntry(entry, '- ', '  ')).join('')
}

/**
 * @param {PatchEntry} entry
 * @param {string} bullet - the prefix for the first line
 * @param {string} indent - the prefix for continuation lines
 * @returns {string}
 */
function emitEntry(entry, bullet, indent) {
  /** @type {string[]} */
  const lines = []

  const push = (/** @type {string} */ text) => {
    lines.push(`${lines.length === 0 ? bullet : indent}${text}`)
  }

  if (entry.id !== undefined) push(`id: ${quote(entry.id)}`)
  if (entry.name !== undefined) push(`name: ${quote(entry.name)}`)
  if (entry.disabled !== undefined) push(`disabled: ${entry.disabled ? 'true' : 'false'}`)

  if (entry.config !== undefined) {
    push('config:')
    for (const [key, value] of Object.entries(entry.config)) {
      lines.push(`${indent}  ${quote(key)}: ${scalar(value)}`)
    }
  }

  if (entry.insert !== undefined) {
    push('insert:')
    for (const nested of entry.insert) {
      const nestedText = emitEntry(nested, `${indent}  - `, `${indent}    `)
      lines.push(...nestedText.split('\n').filter((line) => line !== ''))
    }
  }

  return `${lines.join('\n')}\n`
}

/**
 * Quotes a scalar so it cannot be read as YAML syntax.
 *
 * Single quotes are used because they have no escape processing in YAML beyond a doubled
 * quote — nothing inside can start an escape sequence or a tag.
 *
 * @param {string} value
 * @returns {string}
 */
function quote(value) {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function scalar(value) {
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  throw new TypeError(`unsupported patch config value: ${JSON.stringify(value)}`)
}
