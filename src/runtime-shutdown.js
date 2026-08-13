/**
 * Stops the current runtime and releases ownership only after stop succeeds. Keeping the
 * identity on failure is what makes a later quit request a real retry rather than a false
 * success with an orphaned process.
 *
 * @param {{getCurrent: () => ({stop: () => Promise<void>} | null), clearIfCurrent: (current: {stop: () => Promise<void>}) => void}} dependencies
 */
export function createRuntimeShutdown({ getCurrent, clearIfCurrent }) {
  return async () => {
    const current = getCurrent()
    if (current === null) return
    await current.stop()
    clearIfCurrent(current)
  }
}
