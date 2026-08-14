# Contributing

Thanks for looking. This is a small project with a narrow scope, and the fastest way to
get a change merged is to know where its boundary is.

## Scope

This repository is **only the desktop shell**. Agent behaviour — models, tools, sessions,
permissions, the web UI — lives upstream in
[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness).

If your change is about what the agent *does*, it belongs upstream. If it is about how the
runtime gets launched, watched, contained, or shut down, it belongs here.

The shell does not patch or fork upstream code. Preferences are expressed through the
kernel's own `--patch` overlay mechanism, which is a supported part of its configuration
layering. A change that requires editing upstream files is a sign the problem should be
reported upstream instead.

## Getting set up

```sh
npm install              # shell dependencies
npm test                 # unit tests — fast, no network, no Electron
npm run kernel:install   # fetch the pinned kernel
npm run test:e2e         # start a real kernel and assert it serves
npm start                # run the shell
```

## Where code goes

Decisions live in plain modules under `src/` with no Electron or filesystem imports;
`src/main.js` does IO and orchestration. Please keep that split.

The reason is practical rather than stylistic: the failures that matter in this project are
about processes, timing, and permissions, and those are the failures that are hardest to
reproduce once the decision making them is entangled with the IO around it. A rule like
"an open port is not a ready server" is one assertion when it is a pure function, and a
flaky integration test when it is not.

## Tests

Every load-bearing decision needs a test, and the useful test is the one that fails when
the decision is made the obvious-but-wrong way. Some of the existing ones, as examples:

- a navigation allowlist that accepts another local port,
- a Node version check that passes 22.14 because it only compared the major version,
- a redaction rule that misses a key because the JSON quotes sit between the name and the
  colon.

If you change a rule, try breaking the implementation on purpose and check that a test
turns red. A test that passes against a deliberately broken implementation is not
protecting anything.

## Upgrading the kernel

The pinned version and its integrity hash live in `upstream.lock.json`, and nowhere else.
Upgrading means editing that file in its own commit, then running
`npm run kernel:install` (which verifies what actually landed against the lock) and
`npm run test:e2e`.

Upstream is a developer preview that documents breaking changes between releases, so this
is deliberately a decision someone makes, rather than something a rebuild does quietly.

## Commits and pull requests

- One concern per commit; explain *why* in the body, since the *what* is in the diff.
- `npm test`, `npm run typecheck`, `npm run scan:leaks`, and `npm run scan:workflows`
  should pass before you push. `scan:workflows` rejects `uses: actions/foo@v4` —
  the repo requires a full commit SHA or GitHub Actions dies at startup and the
  tests never run.
- Describe what you actually verified. "Ran the app on macOS 15 arm64 and the window opened"
  is more useful than "should work".

## Reporting a problem

Startup failures are the most common category, and the shell captures the kernel's output
for exactly this reason. Include what the error dialog said, your OS, and your Node
version (`node --version`). Please check the output for anything sensitive before pasting
it — redaction is pattern-based and cannot be complete.
