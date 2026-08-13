/**
 * Creates Electron's synchronous before-quit handler while keeping shutdown asynchronous.
 * The first request is stopped; only the coordinator may resume quitting after cleanup.
 *
 * @param {{shutdown: () => Promise<void>, resumeQuit: () => void, onFailure?: (error: unknown) => void}} dependencies
 * @returns {(event: {preventDefault: () => void}) => void}
 */
export function createBeforeQuitHandler({ shutdown, resumeQuit, onFailure = () => undefined }) {
  let phase = 'idle'

  return (event) => {
    if (phase === 'ready') return
    event.preventDefault()
    if (phase === 'stopping') return
    phase = 'stopping'
    void shutdown()
      .then(() => {
        phase = 'ready'
        resumeQuit()
      })
      .catch((error) => {
        phase = 'idle'
        onFailure(error)
      })
  }
}
