const assert = require("node:assert/strict")
const test = require("node:test")
const { EXPECTED, classify } = require("./audit-lifecycle")

const expectedEntries = () => [...EXPECTED.keys()].map((identity) => {
  const split = identity.lastIndexOf("@")
  return { name: identity.slice(0, split), version: identity.slice(split + 1) }
})

test("accepts exactly the reviewed lifecycle set", () => {
  assert.deepEqual(classify(expectedEntries()), [])
})

test("fails when an expected lifecycle package disappears", () => {
  assert.match(classify(expectedEntries().slice(1))[0].problem, /missing/)
})

test("fails when an unknown lifecycle package appears", () => {
  assert.match(classify([...expectedEntries(), { name: "unexpected", version: "1.0.0" }]).at(-1).problem, /unknown/)
})
