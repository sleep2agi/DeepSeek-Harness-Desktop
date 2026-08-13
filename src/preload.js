const { contextBridge } = require("electron")

contextBridge.exposeInMainWorld("desktopShell", Object.freeze({
  platform: process.platform,
}))
