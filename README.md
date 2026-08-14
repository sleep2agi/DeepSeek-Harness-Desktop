# DeepSeek Harness Desktop

An unofficial community desktop shell for the public
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) agent runtime.

### [⬇ Download for Windows (x64)][latest-exe]

[**Installer**][latest-exe] · [Portable zip][latest-zip] · [All releases][releases]

Nothing else to install — the agent runtime and its Node are inside the download.
Unsigned, so Windows SmartScreen will warn on first run.

[latest-exe]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/latest/download/DeepSeek-Harness-Desktop-0.1.1-x64.exe
[latest-zip]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/latest/download/DeepSeek-Harness-Desktop-0.1.1-x64.zip
[releases]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases

`dsh` is a command-line agent runtime that also serves a full web UI. This project wraps
that runtime in a desktop application: it starts the kernel as a local child process,
waits until it is genuinely serving, and shows its UI in a hardened window — so the
runtime can be launched by double-clicking rather than from a terminal.

> **Status: early development.** The kernel itself is an upstream developer preview
> (`0.1.0-rc.x`) whose configuration surface is still changing. Windows is the platform
> that has been built and run end to end; see [Roadmap](#roadmap) for the rest.

| | |
|:---:|:---:|
| ![Starting a session](docs/images/01-home.png) | ![Choosing an agent preset](docs/images/02-agent-modes.png) |
| Starting a session in a workspace | Choosing an agent preset |
| ![Plugin settings](docs/images/03-settings-plugins.png) | ![General settings](docs/images/04-settings-general.png) |
| Configuring the kernel's plugins | Presets, permissions, and appearance |

Everything above is the upstream web UI, served by the kernel and rendered in the shell's
window. The shell contributes the window, the process, and the security policy around
them — not the interface.

## What this is, and what it is not

This repository contains **only the desktop shell**. All agent behaviour — models, tools,
sessions, permissions, the web UI — comes from the upstream kernel and its plugins.

The shell owns four things, and deliberately nothing else:

| Concern | What the shell does |
|---|---|
| **Process** | Starts `dsh` as a child process on a free port, and shuts down the whole process tree on exit. |
| **Readiness** | Waits for a real HTTP response from *this* launch before showing a window. |
| **Window** | Applies a fixed security policy: sandboxed renderer, exact-origin navigation allowlist, `http`/`https`-only external links. |
| **Configuration** | Expresses its preferences as a patch overlay, through the kernel's own supported mechanism, without modifying upstream code. |

Nothing upstream is patched or vendored-and-edited. The kernel is installed from npm at a
pinned version, and every shell preference goes through `--patch`, which is a first-class
part of the launcher's configuration layering.

## Design notes

A few decisions that are easy to get wrong, and why this shell makes them the way it does.

**An open port is not a ready server.** The kernel's web server binds its port during
startup, and a plugin failing afterwards can still bring the process down. In that window
a TCP connection succeeds while nothing is being served, and a window pointed at it shows
a blank page. Readiness therefore requires a real HTTP 2xx/3xx response.

**Readiness is bound to one launch.** Every probe attempt re-checks that the process being
waited on is still the current one. Otherwise a kernel that died and left its port to
another program on the machine would answer the probe perfectly well — with someone else's
server.

**Navigation is compared as an exact origin.** `startsWith('http://127.0.0.1:')` also
matches any other service running locally, and `includes('127.0.0.1')` matches
`http://evil.example/?x=127.0.0.1`. The loaded page decides its own links; the shell does
not get to assume they are benign.

**Secrets are redacted as they enter the log buffer,** not as they leave it. Redacting at
read time still leaves the plaintext sitting in this process's memory until then. The
matching is by shape and cannot be complete — it is a second line of defence, not a
guarantee.

**The kernel gets its own `DSH_HOME`,** and every inherited `DSH_*` variable is dropped.
Sharing a home directory with a `dsh` the user installed themselves would have the two
overwrite each other's configuration, and would put the user's own stored credentials
within reach of this process.

**Telemetry is switched off explicitly.** Upstream already defaults it to disabled; the
shell states it anyway, so the default is a property of this application rather than of
whichever kernel version happens to be bundled.

**The kernel runs on its own bundled Node, not on Electron's.** Those are different
runtimes, and the difference is not theoretical. With an identical kernel and an identical
configuration, launched under Electron-as-Node the kernel aborts during startup:

```
failed to apply loader entry … (@deepseek-ai/cordis-plugin-hmr):
  --expose-internals is required for HMR service
```

and on a stock Node build of the same major version it starts cleanly. Notably this
happens *after* the web server is already answering HTTP — so even a real HTTP response is
not proof that the process will stay up, which is why an unexpected kernel exit is
reported rather than silently leaving a window pointed at nothing.

The bundled runtime is downloaded from nodejs.org, checked against the SHA-256 published
in that release's `SHASUMS256.txt`, and then asked what version it is. Both checks fail the
build rather than warn.

**What ships is not what npm installs.** An npm tree is published for developers: debug
symbols, source maps, the TypeScript the JavaScript was built from, documentation, and
prebuilt binaries for every platform. None of it is opened by a running application, and
all of it would ship to every user — 180 MB of the installed size. `tools/prune-kernel.js`
removes it, keeping licences and notices in every spelling, since redistributing
MIT-licensed code without its licence text is a violation. The end-to-end test runs against
the pruned kernel, so a size win that broke startup fails the build.

## Requirements

**To run a packaged build:** nothing. The kernel and its Node runtime are inside the
installer.

**To develop:** Node.js ≥ 22.15.0 — the kernel uses `zlib.createZstdDecompress`, which does
not exist in earlier versions.

Windows is built and verified end to end. macOS and Linux are expected to work but have not
been exercised; the bundled-runtime step is currently Windows-only and falls back to the
system Node elsewhere.

## Development

```sh
npm install          # shell dependencies (Electron, builder, types)
npm test             # unit tests for every load-bearing decision — no network, no Electron
npm run kernel:install   # fetch the pinned kernel into resources/kernel
npm start            # launch the shell against it
```

The kernel version is pinned in [`upstream.lock.json`](upstream.lock.json), which is the
single source of truth for it. Upgrading is an explicit commit, not something a rebuild
does on its own — upstream is a developer preview and documents that it will make
breaking changes.

### Layout

Load-bearing *decisions* live in plain modules with no Electron or filesystem imports, so
they can be tested directly:

| Module | Decides |
|---|---|
| `src/window-policy.js` | Where the window may navigate; what may be handed to the OS. |
| `src/kernel-runtime.js` | The kernel's argument vector and environment. |
| `src/readiness.js` | When the kernel counts as ready. |
| `src/log-redact.js` | What may enter the log buffer, and how much is kept. |

`src/main.js` does IO and orchestration only.

## Roadmap

- [x] Kernel launch, argument and environment construction
- [x] Readiness probe bound to a single launch
- [x] Window and navigation security policy
- [x] Bounded, redacted log capture
- [x] Bundled, checksum-verified Node runtime
- [x] Windows installer, verified by launching it and loading the UI
- [x] Workspace picker verified working on the bundled runtime — the kernel's native
      Windows picker has been reported to crash under other runtimes; on this build it
      opens, cancels, and leaves the kernel serving. `buildShellPatch({
      useBrowseDirectoryPicker: true })` selects the non-native implementation if a build
      ever needs it, and is off by default
- [ ] macOS and Linux builds

## Independence

Everything here is written from public sources against pinned public dependencies. It does
not copy private product code, and contains no organization-specific branding,
authentication clients, private endpoints, update feeds, credentials, or telemetry. The
`scan:leaks` check in CI enforces this against the working tree and the committed history,
and fails the build rather than warning.

This project is not affiliated with or endorsed by DeepSeek.

## Licence

Repository-authored code is MIT — see [LICENSE](LICENSE).

This project bundles the upstream `@deepseek-ai/dsh` kernel, which is also MIT-licensed.
Third-party components retain their own licences, redistributed with the packaged
application; see [NOTICE](NOTICE) for attribution and the trademark position.
