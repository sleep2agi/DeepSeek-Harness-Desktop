const readline = require("node:readline")
const { parseReadyUrl } = require("./ready-url")

class RuntimeOwner {
  constructor({ spawn, probe, terminate, startupTimeoutMs = 20_000, setTimer = setTimeout, clearTimer = clearTimeout }) {
    if (typeof spawn !== "function" || typeof probe !== "function" || typeof terminate !== "function") throw new TypeError("runtime-owner-dependencies-invalid")
    this.dependencies = { spawn, probe, terminate, setTimer, clearTimer }
    this.startupTimeoutMs = startupTimeoutMs
    this.generation = 0
    this.current = undefined
    this.candidate = undefined
  }

  async start(spec) {
    const generation = ++this.generation
    let child
    try { child = this.dependencies.spawn(spec) } catch { return { ok: false, reason: "spawn-error" } }
    if (!child?.stdout || typeof child.once !== "function") return { ok: false, reason: "spawn-contract-invalid" }
    const candidate = { child, generation, settled: false }
    this.candidate = candidate
    const ready = await this.#waitForReady(candidate)
    if (!ready.ok) {
      if (this.candidate === candidate) this.candidate = undefined
      await this.dependencies.terminate(child)
      return ready
    }
    if (this.candidate !== candidate || generation !== this.generation) {
      await this.dependencies.terminate(child)
      return { ok: false, reason: "stale-candidate" }
    }
    const healthy = await this.dependencies.probe({ child, origin: ready.origin, port: ready.port })
    if (!healthy || this.candidate !== candidate || generation !== this.generation) {
      if (this.candidate === candidate) this.candidate = undefined
      await this.dependencies.terminate(child)
      return { ok: false, reason: healthy ? "stale-candidate" : "health-failed" }
    }
    const previous = this.current
    this.current = candidate
    this.candidate = undefined
    if (previous) await this.dependencies.terminate(previous.child)
    return { ok: true, origin: ready.origin, port: ready.port, generation }
  }

  async stop() {
    ++this.generation
    const targets = [this.candidate, this.current].filter(Boolean)
    this.candidate = undefined
    this.current = undefined
    await Promise.all(targets.map((target) => this.dependencies.terminate(target.child)))
  }

  #waitForReady(candidate) {
    return new Promise((resolve) => {
      let settled = false
      let timer
      let lines
      const finish = (result) => {
        if (settled) return
        settled = true
        candidate.settled = true
        if (timer !== undefined) this.dependencies.clearTimer(timer)
        lines?.close()
        resolve(result)
      }
      timer = this.dependencies.setTimer(() => finish({ ok: false, reason: "startup-timeout" }), this.startupTimeoutMs)
      if (settled) return
      lines = readline.createInterface({ input: candidate.child.stdout })
      lines.on("line", (line) => {
        const parsed = parseReadyUrl(line)
        if (parsed) finish({ ok: true, ...parsed })
      })
      candidate.child.once("error", () => finish({ ok: false, reason: "spawn-error" }))
      candidate.child.once("exit", () => finish({ ok: false, reason: "exit-before-ready" }))
    })
  }
}

module.exports = { RuntimeOwner }
