/**
 * Bounded, redacted capture of the kernel's output.
 *
 * @module log-redact
 */

/**
 * Patterns for things that must never reach the log buffer.
 *
 * Matching is by *shape*, which is a real limitation and worth stating plainly: a
 * credential that does not look like one gets through. This is a second line of defence
 * behind not logging secrets in the first place, not a guarantee.
 *
 * @type {ReadonlyArray<{pattern: RegExp, replace: string}>}
 */
const RULES = Object.freeze([
  // `sk-...` style API keys, the form DeepSeek and OpenAI-compatible providers issue.
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, replace: 'sk-[redacted]' },
  // GitHub tokens, which turn up whenever someone pastes one into a session.
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, replace: 'gh?_[redacted]' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replace: 'github_pat_[redacted]' },
  // `Authorization: Bearer <token>` in anything that echoes a request.
  { pattern: /\b(bearer\s+)[A-Za-z0-9._~+/-]{16,}=*/gi, replace: '$1[redacted]' },
  // Assignments to an obviously secret-named variable, in env dumps or JSON.
  // The optional quotes around the name matter: in JSON the key is `"apiToken":`, so a
  // pattern demanding the separator immediately after the name misses every JSON payload.
  {
    pattern:
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)("?\s*[=:]\s*"?)([^\s"',}]{8,})/gi,
    replace: '$1$2[redacted]',
  },
])

/**
 * Replaces anything credential-shaped in `text`.
 *
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  let output = text
  for (const { pattern, replace } of RULES) {
    output = output.replace(pattern, replace)
  }
  return output
}

/**
 * A fixed-size ring of recent log lines.
 *
 * Redaction happens on the way in, not on the way out: a secret that is stored raw and
 * cleaned up at read time still spent that whole time sitting in this process's memory,
 * where a crash dump would find it.
 *
 * The count of dropped lines is kept and reported, because "the log does not mention it"
 * and "the log overflowed before you looked" lead to opposite conclusions when debugging.
 */
export class LogBuffer {
  /** @type {string[]} */
  #lines = []
  #dropped = 0
  #limit

  /** @param {number} [limit] - how many lines to retain */
  constructor(limit = 2000) {
    this.#limit = limit
  }

  /**
   * Appends one chunk, splitting it into lines.
   *
   * @param {string} chunk
   * @returns {void}
   */
  push(chunk) {
    for (const line of redact(chunk).split(/\r?\n/)) {
      if (line === '') continue
      this.#lines.push(line)
    }

    if (this.#lines.length > this.#limit) {
      const excess = this.#lines.length - this.#limit
      this.#lines.splice(0, excess)
      this.#dropped += excess
    }
  }

  /** @returns {string[]} the retained lines, oldest first */
  lines() {
    return [...this.#lines]
  }

  /** @returns {number} how many lines were discarded to stay within the limit */
  dropped() {
    return this.#dropped
  }

  /**
   * The buffer as text, with an explicit note when older lines were dropped.
   *
   * @returns {string}
   */
  text() {
    const header = this.#dropped > 0 ? [`… ${this.#dropped} earlier line(s) dropped`] : []
    return [...header, ...this.#lines].join('\n')
  }
}
