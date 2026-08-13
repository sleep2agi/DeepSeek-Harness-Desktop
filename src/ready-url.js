const READY_PREFIX = "dsh web: "

function parseReadyUrl(line) {
  if (typeof line !== "string" || !line.startsWith(READY_PREFIX)) return undefined
  const firstToken = line.slice(READY_PREFIX.length).trim().split(/\s+/, 1)[0]
  let url
  try {
    url = new URL(firstToken)
  } catch {
    return undefined
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return undefined
  const port = Number(url.port)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return undefined
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined
  return Object.freeze({ origin: url.origin, port })
}

module.exports = { READY_PREFIX, parseReadyUrl }
