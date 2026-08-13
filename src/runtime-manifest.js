const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

function hashFile(file) {
  const hash = crypto.createHash("sha256")
  const descriptor = fs.openSync(file, "r")
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    for (;;) {
      const count = fs.readSync(descriptor, buffer, 0, buffer.length, null)
      if (count === 0) break
      hash.update(buffer.subarray(0, count))
    }
  } finally {
    fs.closeSync(descriptor)
  }
  return hash.digest("hex")
}

function safeResolve(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error("runtime-relative-path-invalid")
  }
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, relativePath)
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("runtime-relative-path-escapes-root")
  }
  return target
}

function verifyFile(root, spec, label) {
  const file = safeResolve(root, spec.relativePath)
  const stat = fs.statSync(file)
  if (!stat.isFile()) throw new Error(`${label}-not-file`)
  if (spec.size !== undefined && stat.size !== spec.size) throw new Error(`${label}-size-mismatch`)
  if (hashFile(file) !== spec.sha256) throw new Error(`${label}-sha256-mismatch`)
  return file
}

function verifyRuntime(runtimeRoot, inputs) {
  if (inputs?.schemaVersion !== 1 || inputs?.target?.platform !== "win32" || inputs?.target?.arch !== "x64") {
    throw new Error("runtime-manifest-target-invalid")
  }
  const node = verifyFile(runtimeRoot, {
    relativePath: path.join("node", inputs.node.executableRelativePath),
    sha256: inputs.node.executableSha256,
    size: inputs.node.executableSize,
  }, "node-executable")
  const nodeLicense = verifyFile(runtimeRoot, {
    relativePath: path.join("node", inputs.node.licenseRelativePath),
    sha256: inputs.node.licenseSha256,
  }, "node-license")
  const entry = verifyFile(runtimeRoot, {
    relativePath: path.join("dsh", inputs.dsh.entryRelativePath),
    sha256: inputs.dsh.entrySha256,
  }, "dsh-entry")
  const dshLicense = verifyFile(runtimeRoot, {
    relativePath: path.join("dsh", inputs.dsh.licenseRelativePath),
    sha256: inputs.dsh.licenseSha256,
  }, "dsh-license")
  const frontendIndex = verifyFile(runtimeRoot, {
    relativePath: path.join("dsh", inputs.dsh.frontendIndexRelativePath),
    sha256: inputs.dsh.frontendIndexSha256,
    size: inputs.dsh.frontendIndexSize,
  }, "dsh-frontend-index")
  const nativeFiles = inputs.dsh.native.files.map((spec, index) => verifyFile(path.join(runtimeRoot, "dsh"), spec, `dsh-native-${index}`))
  return Object.freeze({ node, nodeLicense, entry, dshLicense, frontendIndex, nativeFiles: Object.freeze(nativeFiles) })
}

module.exports = { hashFile, safeResolve, verifyFile, verifyRuntime }
