# Runtime provenance and current limits

This phase uses only public inputs:

- DeepSeek Harness source anchor: `deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`
  (MIT). The npm runtime is a separately published input and is not claimed byte-identical to this source commit.
- npm runtime: `@deepseek-ai/dsh@0.1.0-rc.6`, with registry integrity and root tarball shasum in
  `runtime/runtime-inputs.json` and the complete transitive graph in `runtime/pnpm-lock.yaml`.
- Node: official `node-v22.22.0-win-x64.zip`, with archive, extracted executable and license hashes in
  `runtime/runtime-inputs.json`.
- Dependency materializer: Corepack with `pnpm@11.21.0`; the resolver integrity is declared by
  `runtime/package.json`, the public npm integrity is verified by CI, and the exact lockfile digest is
  bound in `runtime/runtime-inputs.json`.

## Lifecycle-script policy

The resolved graph contains five packages with install lifecycle scripts. Only `node-pty@1.1.0` and
`koffi@3.1.4` are allowed to execute: both select or verify platform-native bytes needed by the runtime.
The other three are denied:

- `@deepseek-ai/dsh-subprocess-local@0.1.0-rc.6` only restores a Unix executable bit on a spawn helper;
- `@google/genai@1.52.0` declares a no-op preinstall;
- `protobufjs@7.6.5` emits a dependency-version warning and does not materialize runtime bytes.

`tools/audit-lifecycle.js` requires the observed set and classification to match exactly. A new or missing
lifecycle package is a hard failure, not an implicit approval.

## Evidence not yet available

This source slice is not a Windows runtime GO. It still needs artifact-bound Windows evidence for:

- frozen installation with the target-platform optional packages and exact native-file hashes;
- `node.exe --version`, `koffi` load and `node-pty` terminal/subprocess start/termination;
- launch with a user `PATH` containing no Node;
- process-tree cleanup, crash recovery and stale-event behavior under a real packaged Electron process;
- unpacked application, archive/installer, SBOM, notices and public-identity artifact scans.

Linux source tests and lock inspection cannot substitute for those controls.
