/**
 * Whether a GitHub Actions `uses:` value is pinned the way this repository
 * is required to pin it.
 *
 * The repo's Actions settings set `sha_pinning_required`. A workflow that
 * writes `actions/checkout@v4` is rejected at *startup* — no job is created,
 * so `npm test` never runs. Tag refs are therefore not a pin. Only a full
 * 40-character commit SHA on a github-owned action (`actions/…`) counts.
 *
 * Third-party actions are rejected even when SHA-pinned: the allow-list is
 * github-owned only, and `softprops/action-gh-release@<sha>` fails the same
 * way a tag ref does.
 *
 * @module workflow-policy
 */

const PINNED_GITHUB = /^(actions\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)@([0-9a-f]{40})$/

/**
 * @param {string} value - the `uses:` value, quotes already stripped
 * @returns {{action: string, sha: string} | null}
 */
export function parsePinnedGithubAction(value) {
  const match = PINNED_GITHUB.exec(value.trim())
  const action = match?.[1]
  const sha = match?.[2]
  if (action === undefined || sha === undefined) return null
  return { action, sha }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isPinnedGithubAction(value) {
  return parsePinnedGithubAction(value) !== null
}

/**
 * Every `uses:` value in a workflow document, with its 1-based line number.
 *
 * Scanned as text rather than parsed as YAML: GitHub evaluates the literal,
 * and a YAML library would hide a quoted `@v4`.
 *
 * @param {string} text
 * @returns {Array<{line: number, value: string}>}
 */
export function findUses(text) {
  /** @type {Array<{line: number, value: string}>} */
  const found = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*(?:-\s*)?uses:\s*(\S.*?)\s*$/.exec(lines[index] ?? '')
    if (match === null) continue
    found.push({ line: index + 1, value: stripCommentAndQuotes(match[1] ?? '') })
  }
  return found
}

/**
 * @param {string} text
 * @returns {Array<{line: number, value: string}>}
 */
export function findUnpinnedUses(text) {
  return findUses(text).filter((entry) => !isPinnedGithubAction(entry.value))
}

/**
 * @param {string} raw
 * @returns {string}
 */
function stripCommentAndQuotes(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, '')
  if (
    (withoutComment.startsWith('"') && withoutComment.endsWith('"')) ||
    (withoutComment.startsWith("'") && withoutComment.endsWith("'"))
  ) {
    return withoutComment.slice(1, -1)
  }
  return withoutComment
}
