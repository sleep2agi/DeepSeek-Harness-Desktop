# Security Policy

## Reporting

Please use GitHub's private vulnerability reporting for security-sensitive reports. Do not place credentials,
tokens, private endpoints, personal paths, or exploit details in a public issue.

## Trust boundaries

- Web content and renderer processes are untrusted.
- Credentials must not enter renderer-controlled IPC, logs, crash reports, build artifacts, or update metadata.
- Runtime executables and dependency graphs must be pinned and verified by both manifest identity and actual
  packaged bytes before execution.
- Network navigation, local process identity, and native-module availability fail closed.
- Release evidence must bind source, tools, dependency locks, unpacked bytes, and published artifacts.

No release is security-supported until the release and artifact gates in the supervision ledger are closed.
