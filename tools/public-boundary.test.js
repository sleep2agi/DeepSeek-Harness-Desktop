import assert from "node:assert/strict"
import { scanEntries } from "./public-boundary.js"

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

check("private organization and product identities are rejected", () => {
  const findings = scanEntries([
    { name: "a.txt", text: ["tian", "ma"].join("") },
    { name: "b.txt", text: ["tm", "work"].join("") },
    { name: "c.txt", text: String.fromCodePoint(0x5929, 0x9a6c) },
  ])
  assert.deepEqual(findings.map((value) => value.rule), [
    "private-product-identity",
    "private-product-identity",
    "private-product-identity",
  ])
})

check("private application and component identities are rejected", () => {
  const findings = scanEntries([
    { name: "a.txt", text: ["cli", "aab9eabbceba9cca"].join("_") },
    { name: "b.txt", text: ["tm", "code"].join("") },
    { name: "c.txt", text: ["agent", "portal"].join("-") },
  ])
  assert.deepEqual(findings.map((value) => value.rule), [
    "private-product-identity",
    "private-product-identity",
    "private-product-identity",
  ])
})

check("credential-shaped assignment is rejected", () => {
  const secret = ["app", "secret"].join("_") + ": " + "abcdefghijklmnop"
  assert.equal(scanEntries([{ name: "config.yml", text: secret }])[0].rule, "credential-assignment")
})

check("private endpoint is rejected", () => {
  const findings = scanEntries([
    { name: "a.json", text: "https://service." + "internal/v1" },
    { name: "b.json", text: `http://${[192, 168, 1, 20].join(".")}/api` },
    { name: "c.json", text: `http://${["local", "host"].join("")}:3000/` },
  ])
  assert.deepEqual(findings.map((value) => value.rule), ["private-network-url", "private-network-url", "private-network-url"])
  assert.deepEqual(scanEntries([{ name: "local-runtime.json", text: "http://127.0.0.1:43127/" }]), [])
})

check("developer-machine paths are rejected", () => {
  const findings = scanEntries([
    { name: "a.txt", text: ["C:", "Users", "developer", "project"].join("\\") },
    { name: "b.txt", text: ["", "home", "developer", "project"].join("/") },
    { name: "c.txt", text: ["C:", "users", "developer", "project", ""].join("/") },
  ])
  assert.deepEqual(findings.map((value) => value.rule), ["windows-user-path", "unix-user-path", "windows-user-path", "unix-user-path"])
})

check("unknown tracked binary surface fails closed", () => {
  assert.equal(scanEntries([{ name: "asset.exe", text: "" }])[0].rule, "unknown-tracked-binary-surface")
  assert.equal(scanEntries([{ name: "payload.js", bytes: Buffer.from([0, 1, 2, 3]) }])[0].rule, "unknown-tracked-binary-surface")
})

check("reviewed binary assets require both exact path and digest", () => {
  const known = "f1997b17f3630c1683aa86f2550251edfdfe1914a2943cbb958a706dedb8b2dd"
  assert.deepEqual(scanEntries([{ name: "assets/icon.png", bytes: Buffer.from([0]), sha256: known }]), [])
  assert.equal(scanEntries([{ name: "assets/icon.png", bytes: Buffer.from([0]), sha256: "0".repeat(64) }])[0].rule, "unknown-tracked-binary-surface")
  assert.equal(scanEntries([{ name: "other/icon.png", bytes: Buffer.from([0]), sha256: known }])[0].rule, "unknown-tracked-binary-surface")
  const screenshot = "d1d070afe24635714341c6910be91bacb258dc8dad3d3a3f65ae34a75bfca646"
  assert.deepEqual(scanEntries([{ name: "docs/images/01-home.png", bytes: Buffer.from([0]), sha256: screenshot }]), [])
  assert.equal(scanEntries([{ name: "docs/images/01-home.png", bytes: Buffer.from([0]), sha256: "f".repeat(64) }])[0].rule, "unknown-tracked-binary-surface")
})

check("private identity in a tracked path is rejected", () => {
  const identity = ["tm", "work"].join("")
  assert.equal(scanEntries([{ name: `packages/${identity}/client.js`, text: "public code" }])[0].rule, "private-product-identity-in-path")
})

check("tracked symlink blob text is scanned rather than its target", () => {
  const marker = ["PRIVATE", "PRODUCT", "MARKER", "DO", "NOT", "SHIP"].join("_")
  assert.equal(scanEntries([{ name: "link.js", bytes: Buffer.from(marker) }])[0].rule, "synthetic-private-product-marker")
})

assert.equal(cases, 11)
console.log(`RESULT cases=${cases} failures=0 skipped=0`)
