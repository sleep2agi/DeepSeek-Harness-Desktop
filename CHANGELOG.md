# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] — 2026-08-16

### Added

- macOS tray: closing the window hides the app instead of quitting, so the kernel
  keeps running. Quit from the tray menu, Dock, or Cmd+Q still stops the kernel
  process tree. Tray icon path and hide-vs-quit are decided by testable helpers
  (`resolveTrayIconPath`, `shouldHideOnClose`).

### Changed

- This is a new tag, not a replacement of `v0.1.2`. Keep using `v0.1.2` for the
  known-good notarized Mac download if this drop is unsigned or a `.dmg` is
  reported damaged.

## [0.1.3] — 2026-08-14

### Changed

- The macOS Apple Silicon `.dmg` / `.zip` is a **new version**, not a replacement of the
  `v0.1.2` filename. `v0.1.2` briefly had two different binaries under the same name
  (first ad-hoc, then Developer ID). Use `v0.1.3` for the notarized build.
- Packaging drops `node_modules/.bin` from the bundled kernel. Those npm shims are
  absolute links to the build machine; leaving them in the `.app` makes
  `codesign --verify --deep` fail.

### Added

- Developer ID signature and Apple notarization on the Apple Silicon package.
  Gatekeeper reports `Notarized Developer ID`. The ticket is stapled to the `.app`.

## [0.1.2] — 2026-08-14

### Added

- **macOS desktop build.** The shell now ships a checksum-verified Node runtime for
  Apple Silicon and Intel (`darwin-arm64`, `darwin-x64`), packages a `.dmg` and a `.zip`,
  and runs the same readiness / window-policy / process-tree shutdown path as Windows.
- Unix kernel processes are spawned as their own process-group leader, so quitting the
  app actually tears down the tools the kernel started rather than leaving them orphaned.
- A Dock- or Finder-launched Mac app prepends Homebrew's usual `PATH` locations, so
  `git` (and the rest of a developer toolchain) is visible to the kernel.

### Changed

- `npm run dist` builds for the current platform. `dist:win` and `dist:mac` select one
  explicitly. CI and the release workflow now cover `macos-latest` as well as Windows.

### Known limitations

- Packaged Mac builds are ad-hoc signed, not notarized. Gatekeeper will warn on a
  downloaded `.dmg`.

## [0.1.1] — 2026-08-14

### Changed

- The packaged application is **180 MB smaller** — 674 MB installed down to 494 MB — with
  no change to what it can do.

  An npm tree is published for developers, and everything in it ships to every user. The
  removed files are the ones a running application never opens: debug symbols (52.8 MB),
  source maps (36.8 MB), the TypeScript the JavaScript was built from (35.0 MB),
  documentation (5.8 MB), and prebuilt native binaries for platforms this build does not
  target (~26 MB). Chromium's locale files account for the remaining 45.6 MB; the two the
  application can actually display are kept.

  Licences and notices are kept in every spelling — redistributing MIT-licensed code
  without its licence text is a violation, and they are small. The end-to-end test runs
  against the pruned kernel, so a size win that broke startup would fail the build.

  Kernel startup also got faster, from ~41 s to ~17 s, with 20,041 fewer files to walk.

## [0.1.0] — 2026-08-13

First preview. Windows is built and verified end to end; macOS and Linux are untested.

### Added

- Launches the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) kernel
  (`@deepseek-ai/dsh` 0.1.0-rc.6) as a child process on a free loopback port and shows its
  web UI in a desktop window.
- Bundles the kernel and the Node runtime it is published against, so a packaged build has
  no external requirements. Both are pinned in `upstream.lock.json`; the kernel is checked
  against its npm integrity hash and Node against the SHA-256 published in that release's
  `SHASUMS256.txt`, with each artefact asked to confirm its own version afterwards.
- Waits for a real HTTP response from the launch being waited on before showing a window,
  and reports an unexpected kernel exit with its captured output rather than leaving a
  window pointed at a process that is gone.
- Confines the window to the kernel's exact origin, restricts external links to
  `http`/`https`, refuses `webview` attachment, and attaches no preload bridge.
- Gives the kernel a private `DSH_HOME`, drops inherited `DSH_*` variables, and sets
  telemetry to disabled explicitly.
- Captures kernel output into a bounded buffer, redacted on entry, with the count of
  dropped lines kept visible.
- `tools/scan-leaks.js`, run in CI, fails the build on credentials, private registries, or
  internal address ranges in the working tree or in history.

### Known limitations

- The kernel's native workspace picker crashes on Windows in this upstream preview.
  `buildShellPatch({ useBrowseDirectoryPicker: true })` selects the non-native
  implementation; it is not enabled by default yet.
- Log redaction matches by shape and cannot be complete.
- Installers are unsigned, so Windows SmartScreen will warn on first run.

[0.1.4]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/tag/v0.1.4
[0.1.3]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/tag/v0.1.3
[0.1.2]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/tag/v0.1.2
[0.1.1]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/tag/v0.1.1
[0.1.0]: https://github.com/sleep2agi/DeepSeek-Harness-Desktop/releases/tag/v0.1.0
