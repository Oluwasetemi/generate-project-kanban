# Generate Project Kanban

Requires [Bun](https://bun.sh/) 1.3.0 or later.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun dev
```

To typecheck:

```bash
bun run typecheck
```

Build a self-contained executable with the YAML templates embedded in the
binary:

```bash
bun run build
```

The executable is written to `dist/generate-project-kanban` and does not need
the repository's `templates/` directory at runtime.

## Releases

Releases are published as standalone executables through GitHub Releases. The
release workflow builds Linux x64, macOS x64, macOS arm64, and Windows x64
artifacts, together with SHA-256 checksum files.

Before tagging a release, update the `version` in `package.json` and run the
full local release check:

```bash
bun run release:check
```

Create and push a matching semantic-version tag:

```bash
```

Pushing a `v*.*.*` tag starts the release workflow. It verifies that the tag
matches `package.json`, rebuilds every platform artifact, and creates a GitHub
Release with generated notes.

Run the unit tests with `bun test`. The generator validates five built-in,
domain-specific YAML project templates, creates a deterministic action plan,
and persists non-secret execution journals with safe resume decisions.

Each template uses the reusable backlog system in `src/story-system.ts`. It
creates functional epic labels and explicit domain user stories with role,
action, benefit, category, week assignments, dependency-aware priorities, and
shared checklist acceptance criteria. Every project option contains 28-32
stories across six weeks,
plus parent-child issue relationships and Project v2 field values.

`BunGitHubAdapter` in `src/github.ts` is a native `fetch` GraphQL/REST adapter.
Construct it with a token supplied at runtime; it never persists credentials.
Use `executePlan` from `src/runner.ts` with a journal path to mark every action
in progress before mutation and persist each result. Resume requires the token
again and reconciles uncertain actions by deterministic markers. A host can
inject a mock adapter and `onExecute` into the wizard for tests or dry runs.

The live flow requires a token with repository, issues, invitations, and Project
v2 permissions. No real GitHub smoke test is possible without external
credentials and a test account.

On the token step, press `Ctrl+V` or `Cmd+V`, or use the terminal's normal
paste shortcut. The app reads the system clipboard and extracts a supported
`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, or `github_pat_` token from surrounding
text. Only the masked value is shown, and Enter will not advance for invalid
text.

This project was created using `bun create tui`. [create-tui](https://github.com/msmps/create-tui) is the easiest way to get started with OpenTUI.
