# Contributing

Thank you for improving DeepSeek Harness Desktop.

## Public-source rule

Contributions must be authored from public sources. Do not copy code, assets, configuration, issue text,
or generated output from a private product or repository. Every external source must be identified by a
stable public URL, exact version or commit, integrity hash where available, and license.

## Pull requests

1. Start from the current `main` branch and keep one reviewable concern per pull request.
2. State the exact head commit, changed-file/addition/deletion denominator, test denominator, and every
   unresolved gate.
3. Include a failing control for every new gate. A check that always accepts or always rejects is invalid.
4. Do not add generated installers, unpacked applications, dependency directories, credentials, machine
   paths, private endpoints, or organization-specific identity.
5. Do not claim platform or artifact behavior from source-only tests.

The protected default branch requires independent approval of the latest push and resolved review threads.
