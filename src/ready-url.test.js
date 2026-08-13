const assert = require("node:assert/strict")
const test = require("node:test")
const { parseReadyUrl } = require("./ready-url")

test("accepts the exact loopback ready line", () => {
  assert.deepEqual(parseReadyUrl("dsh web: http://127.0.0.1:43127"), {
    origin: "http://127.0.0.1:43127",
    port: 43127,
  })
})

test("accepts the upstream LAN annotation but trusts only loopback", () => {
  assert.deepEqual(parseReadyUrl("dsh web: http://127.0.0.1:43127 (LAN: http://192.0.2.1:43127)"), {
    origin: "http://127.0.0.1:43127",
    port: 43127,
  })
})

test("rejects non-loopback, malformed, credentialed, and decorated URLs", () => {
  for (const line of [
    "dsh web: http://0.0.0.0:43127",
    "dsh web: http://localhost:43127",
    "dsh web: https://127.0.0.1:43127",
    "dsh web: http://user@127.0.0.1:43127",
    "dsh web: http://127.0.0.1:43127/path",
    "dsh web: http://127.0.0.1:0",
    "noise dsh web: http://127.0.0.1:43127",
  ]) assert.equal(parseReadyUrl(line), undefined, line)
})
