const crypto = require("node:crypto")
const http = require("node:http")

function probeHarness({ child, origin, expectedIndexSha256, httpGet = http.get, timeoutMs = 2_500, maxBytes = 64 * 1024, setTimer = setTimeout, clearTimer = clearTimeout }) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve(false)
    let settled = false
    let request
    let timer
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimer(timer)
      resolve(result)
    }
    timer = setTimer(() => {
      try { request?.destroy() } catch {}
      finish(false)
    }, timeoutMs)
    if (settled) return
    try {
      request = httpGet(`${origin}/`, (response) => {
        const chunks = []
        let size = 0
        response.on("data", (chunk) => {
          size += chunk.length
          if (size > maxBytes) {
            try { request.destroy() } catch {}
            finish(false)
          } else chunks.push(chunk)
        })
        response.once("aborted", () => finish(false))
        response.once("error", () => finish(false))
        response.once("close", () => { if (!response.complete) finish(false) })
        response.once("end", () => {
          if (response.statusCode !== 200 || !/text\/html/i.test(String(response.headers["content-type"] || ""))) return finish(false)
          const digest = crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex")
          finish(digest === expectedIndexSha256 && child.exitCode === null && child.signalCode === null)
        })
      })
      request.once("error", () => finish(false))
    } catch {
      finish(false)
    }
  })
}

module.exports = { probeHarness }
