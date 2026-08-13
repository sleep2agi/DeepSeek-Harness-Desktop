# Public source and identity policy

This repository is an independent, unofficial community project.

## Allowed inputs

- original contributions made directly to this public repository;
- public upstream source at an exact commit with its license;
- public package-manager artifacts with complete locks and integrity values;
- public build tools pinned to exact versions and action commit SHAs.

## Prohibited inputs

- copied or transformed private-source code, assets, configuration, prompts, documentation, or evidence;
- organization-specific product names, application IDs, domains, authentication clients, protocols, update
  feeds, package coordinates, telemetry identifiers, icons, or credentials;
- mutable downloads, developer-machine dependency trees, untracked build inputs, or local absolute paths;
- claims inherited from another repository's tests, installers, or runtime behavior.

## Required provenance

Each build and release must record the exact source SHA, public upstream identities, dependency-lock hashes,
tool versions, artifact hashes and sizes, license/SBOM outputs, and the identity of the verifier. A source-tree
scan cannot substitute for scanning unpacked and published artifacts.

The automated source gate contains explicit deny rules for known private organization, product, component,
portal, and application identities. Generic heuristics alone are not evidence that this identity boundary is
enforced. Binary assets and historical blob contents require separate provenance and artifact controls; the
current source gate must not be represented as covering those surfaces.
