const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { safeResolve, verifyFile } = require("./runtime-manifest")

test("verifies exact file size and digest", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-public-manifest-"))
  const bytes = Buffer.from("public-runtime")
  fs.writeFileSync(path.join(root, "entry.js"), bytes)
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex")
  assert.equal(verifyFile(root, { relativePath: "entry.js", size: bytes.length, sha256 }, "entry"), path.join(root, "entry.js"))
  assert.throws(() => verifyFile(root, { relativePath: "entry.js", size: bytes.length, sha256: "0".repeat(64) }, "entry"), /sha256-mismatch/)
})

test("rejects absolute and escaping manifest paths", () => {
  assert.throws(() => safeResolve("/safe/root", "/outside"), /invalid/)
  assert.throws(() => safeResolve("/safe/root", "../outside"), /escapes/)
})
