/**
 * Re-checks the exact launch after the BrowserWindow is assigned. An exit before this
 * point must become startup failure, while an exit after it is visible to the registered
 * unexpected-exit handler because the window already exists.
 *
 * @param {{isRunning: () => boolean} | null} running
 */
export function assertStartupRuntimeCurrent(running) {
  if (running === null || !running.isRunning()) throw new Error('The kernel exited before the window was ready.')
}
