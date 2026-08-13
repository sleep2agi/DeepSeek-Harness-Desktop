const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const { PassThrough } = require("node:stream")
const test = require("node:test")
const { RuntimeOwner } = require("./runtime-owner")

function child(pid) {
  const value = new EventEmitter()
  value.pid = pid
  value.stdout = new PassThrough()
  return value
}

test("commits only after exact ready and health, then retires the old runtime", async () => {
  const children = [child(1), child(2)]
  const killed = []
  const owner = new RuntimeOwner({
    spawn: () => children.shift(),
    probe: async ({ child: proc, port }) => proc.pid > 0 && port === 43127,
    terminate: async (proc) => killed.push(proc.pid),
  })
  const first = owner.start({})
  children.length // keep the fixture observable without changing it
  owner.candidate.child.stdout.write("dsh web: http://127.0.0.1:43127\n")
  assert.equal((await first).ok, true)
  const second = owner.start({})
  owner.candidate.child.stdout.write("dsh web: http://127.0.0.1:43127\n")
  assert.equal((await second).ok, true)
  assert.deepEqual(killed, [1])
})

test("non-loopback ready never reaches health and times out", async () => {
  const proc = child(3)
  let probed = 0
  const owner = new RuntimeOwner({
    spawn: () => proc,
    probe: async () => { probed += 1; return true },
    terminate: async () => {},
    startupTimeoutMs: 1,
  })
  const pending = owner.start({})
  proc.stdout.write("dsh web: http://0.0.0.0:43127\n")
  assert.deepEqual(await pending, { ok: false, reason: "startup-timeout" })
  assert.equal(probed, 0)
})

test("health failure kills only the candidate and preserves current", async () => {
  const current = child(4)
  const candidate = child(5)
  const killed = []
  let healthy = true
  const owner = new RuntimeOwner({ spawn: () => healthy ? current : candidate, probe: async () => healthy, terminate: async (proc) => killed.push(proc.pid) })
  let pending = owner.start({})
  owner.candidate.child.stdout.write("dsh web: http://127.0.0.1:43127\n")
  assert.equal((await pending).ok, true)
  healthy = false
  pending = owner.start({})
  owner.candidate.child.stdout.write("dsh web: http://127.0.0.1:43127\n")
  assert.deepEqual(await pending, { ok: false, reason: "health-failed" })
  assert.equal(owner.current.child, current)
  assert.deepEqual(killed, [5])
})

test("stale start cannot replace a newer generation", async () => {
  const first = child(6)
  const second = child(7)
  const queue = [first, second]
  const gates = []
  const killed = []
  const owner = new RuntimeOwner({
    spawn: () => queue.shift(),
    probe: () => new Promise((resolve) => gates.push(resolve)),
    terminate: async (proc) => killed.push(proc.pid),
  })
  const oldStart = owner.start({})
  first.stdout.write("dsh web: http://127.0.0.1:43127\n")
  await new Promise((resolve) => setImmediate(resolve))
  const newStart = owner.start({})
  second.stdout.write("dsh web: http://127.0.0.1:43128\n")
  await new Promise((resolve) => setImmediate(resolve))
  gates[1](true)
  assert.equal((await newStart).ok, true)
  gates[0](true)
  assert.deepEqual(await oldStart, { ok: false, reason: "stale-candidate" })
  assert.equal(owner.current.child, second)
  assert.deepEqual(killed, [6])
})

test("synchronous spawn failure is bounded and preserves the current generation", async () => {
  const current = child(8)
  let fail = false
  const owner = new RuntimeOwner({
    spawn: () => { if (fail) throw new Error("spawn failed"); return current },
    probe: async () => true,
    terminate: async () => {},
  })
  const first = owner.start({})
  current.stdout.write("dsh web: http://127.0.0.1:43127\n")
  assert.equal((await first).ok, true)
  fail = true
  assert.deepEqual(await owner.start({}), { ok: false, reason: "spawn-error" })
  assert.equal(owner.current.child, current)
})

test("a synchronously firing startup wall clock does not enter the ready parser", async () => {
  const proc = child(9)
  const killed = []
  const owner = new RuntimeOwner({
    spawn: () => proc,
    probe: async () => true,
    terminate: async (value) => killed.push(value.pid),
    setTimer: (callback) => { callback(); return 1 },
    clearTimer: () => {},
  })
  assert.deepEqual(await owner.start({}), { ok: false, reason: "startup-timeout" })
  assert.deepEqual(killed, [9])
})
