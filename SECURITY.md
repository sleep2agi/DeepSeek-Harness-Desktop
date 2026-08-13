# Security

## Reporting a vulnerability

Please report suspected vulnerabilities through
[GitHub's private advisory form](https://github.com/sleep2agi/DeepSeek-Harness-Desktop/security/advisories/new)
rather than a public issue, and give us a chance to ship a fix before details are public.

Include what an attacker would gain, and the steps to reproduce. If the issue is in the
agent runtime itself rather than this shell, it belongs with
[upstream](https://github.com/deepseek-ai/deepseek-harness/security).

## What this shell defends

The renderer displays a web UI whose plugin set is decided by the kernel and the user's
configuration. The shell treats that page as untrusted:

- **Sandboxed renderer.** `sandbox: true`, `contextIsolation: true`,
  `nodeIntegration: false`, `webviewTag: false`, defined as a frozen constant so it cannot
  be weakened one flag at a time.
- **No preload bridge.** Nothing from the shell is exposed to the page, so there is no
  shell-provided surface to reach through.
- **Exact-origin navigation.** Navigation is confined to the origin the kernel is serving
  on, compared as a parsed origin — not a prefix or substring match.
- **`http`/`https`-only external links.** `shell.openExternal` asks the OS to handle a URL,
  which for `file:` or a registered scheme can mean launching a local program.
- **Isolated kernel home.** `DSH_HOME` points at an application-private directory and every
  inherited `DSH_*` variable is dropped, so this app and a separately installed `dsh`
  cannot overwrite each other's configuration or read each other's stored credentials.
- **Telemetry off.** Set explicitly rather than relying on the upstream default.
- **Verified kernel install.** The bundled kernel is installed with scripts disabled, and
  the installed version and integrity are read back and compared against
  `upstream.lock.json`. A mismatch fails the build.

## What it does not defend

Stating these plainly is more useful than implying a boundary that is not there.

- **The agent runs with your privileges.** Its tools read, write, and execute as you do.
  The sandbox and approval settings that govern this belong to the kernel, not the shell.
- **Log redaction is pattern-based.** It matches things shaped like credentials. A secret
  that does not look like one gets through. It is a second line of defence behind not
  logging secrets at all.
- **The port is loopback, not authenticated.** Anything already running as your user on
  your machine can reach the kernel's HTTP server while the app is open.
- **Patch overlays are executable configuration.** The kernel's config dialect evaluates
  `!!js` expressions. Do not load a patch file from a source you would not run a script
  from. The shell only ever writes overlays it constructs itself.

## Provenance and release boundary

- Credentials must not enter renderer-controlled IPC, logs, crash reports, build artifacts, or update metadata.
- Runtime executables and dependency graphs must be pinned and verified by both manifest identity and actual
  packaged bytes before execution.
- Network navigation, local process identity, and native-module availability fail closed.
- Release evidence must bind source, tools, dependency locks, unpacked bytes, and published artifacts.

No release is security-supported until the release and artifact gates in the supervision ledger are closed.
