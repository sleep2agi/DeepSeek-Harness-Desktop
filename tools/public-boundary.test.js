const assert = require("node:assert/strict")
const { scanEntries } = require("./public-boundary")

let cases = 0
function check(name, fn) {
  fn()
  cases += 1
  console.log(`PASS ${name}`)
}

check("clean public text is accepted", () => {
  assert.deepEqual(scanEntries([{ name: "README.md", text: "unofficial public desktop shell" }]), [])
})

check("synthetic private-product marker is rejected", () => {
  const marker = ["PRIVATE", "PRODUCT", "MARKER", "DO", "NOT", "SHIP"].join("_")
  assert.equal(scanEntries([{ name: "app.js", text: marker }])[0].rule, "synthetic-private-product-marker")
})

check("credential-shaped assignment is rejected", () => {
  const secret = ["app", "secret"].join("_") + ": " + "abcdefghijklmnop"
  assert.equal(scanEntries([{ name: "config.yml", text: secret }])[0].rule, "credential-assignment")
})

check("private endpoint is rejected", () => {
  const endpoint = "https://service." + "internal/v1"
  assert.equal(scanEntries([{ name: "config.json", text: endpoint }])[0].rule, "private-network-url")
})

check("developer-machine paths are rejected", () => {
  const findings = scanEntries([
    { name: "a.txt", text: ["C:", "Users", "developer", "project"].join("\\") },
    { name: "b.txt", text: ["", "home", "developer", "project"].join("/") },
  ])
  assert.deepEqual(findings.map((value) => value.rule), ["windows-user-path", "unix-user-path"])
})

check("unknown tracked binary surface fails closed", () => {
  assert.equal(scanEntries([{ name: "asset.exe", text: "" }])[0].rule, "unknown-tracked-binary-surface")
})

assert.equal(cases, 6)
console.log(`RESULT cases=${cases} failures=0 skipped=0`)
