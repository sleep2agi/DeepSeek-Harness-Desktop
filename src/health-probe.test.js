const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { EventEmitter } = require("node:events")
const test = require("node:test")
const { probeHarness } = require("./health-probe")

const body = Buffer.from("<!doctype html><title>DeepSeek Harness</title>")
const digest = crypto.createHash("sha256").update(body).digest("hex")
const live = () => ({ exitCode: null, signalCode: null })

function transport({ chunks = [body], statusCode = 200, contentType = "text/html", end = true, complete = true }) {
  let request
  const get = (_url, callback) => {
    request = new EventEmitter()
    request.destroyed = false
    request.destroy = () => { request.destroyed = true }
    const response = new EventEmitter()
    response.statusCode = statusCode
    response.headers = { "content-type": contentType }
    response.complete = complete
    queueMicrotask(() => {
      callback(response)
      for (const chunk of chunks) response.emit("data", chunk)
      if (end) response.emit("end")
    })
    return request
  }
  return { get, request: () => request }
}

test("accepts only the exact complete Harness index", async () => {
  const wire = transport({})
  assert.equal(await probeHarness({ child: live(), origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: wire.get }), true)
  const impostor = transport({ chunks: [Buffer.from("other html")] })
  assert.equal(await probeHarness({ child: live(), origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: impostor.get }), false)
})

test("rejects a dead candidate before issuing a request", async () => {
  let calls = 0
  assert.equal(await probeHarness({ child: { exitCode: 1, signalCode: null }, origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: () => { calls += 1 } }), false)
  assert.equal(calls, 0)
})

test("wall clock bounds a response that never ends", async () => {
  const wire = transport({ end: false, complete: false })
  let timerCallback
  const pending = probeHarness({ child: live(), origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: wire.get, setTimer: (fn) => { timerCallback = fn; return 1 }, clearTimer: () => {} })
  await new Promise((resolve) => setImmediate(resolve))
  timerCallback()
  assert.equal(await pending, false)
  assert.equal(wire.request().destroyed, true)
})

test("a synchronously firing injected wall clock fails closed", async () => {
  let requests = 0
  const result = await probeHarness({
    child: live(),
    origin: "http://127.0.0.1:1",
    expectedIndexSha256: digest,
    httpGet: () => { requests += 1 },
    setTimer: (callback) => { callback(); return 1 },
    clearTimer: () => {},
  })
  assert.equal(result, false)
  assert.equal(requests, 0)
})

test("oversized and incomplete responses fail without waiting for a good late end", async () => {
  const oversized = transport({ chunks: [Buffer.alloc(65)], complete: true })
  const pending = probeHarness({ child: live(), origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: oversized.get, maxBytes: 64 })
  assert.equal(await pending, false)
  assert.equal(oversized.request().destroyed, true)
  const incomplete = transport({ chunks: [body], end: false, complete: false })
  const result = probeHarness({ child: live(), origin: "http://127.0.0.1:1", expectedIndexSha256: digest, httpGet: incomplete.get, timeoutMs: 10 })
  await new Promise((resolve) => setImmediate(resolve))
  incomplete.request().emit("close")
  assert.equal(await result, false)
})
