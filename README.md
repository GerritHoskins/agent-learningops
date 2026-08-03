# Agent LearningOps

Agent LearningOps is a standalone local-first desktop app, CLI, and MCP server for turning agent learning artifacts into auditable proposal, decision, and patch-preview records. It is designed to run as its own package and does not depend on a parent monorepo, private registry, or private product repository.

The desktop app is the preferred surface. The CLI and MCP server remain available for automation and compatibility, but the GUI replaces day-to-day command-line workflow with a repository picker, review queues, decision receipts, patch previews, exports, and diagnostics.

## Architecture

- Electron 43 hosts the desktop shell with `contextIsolation`, renderer sandboxing, and no renderer Node integration.
- Svelte 5, Vite, Tailwind 4, and Skeleton 5 render the dashboard UI.
- TanStack Table powers the dense learning, proposal, and audit tables.
- ECharts renders the proposal classification chart.
- SQLite state, markdown import/export, proposal generation, decisions, and patch previews run behind a typed application facade.
- Electron main validates IPC senders and forwards work to a `worker_threads` service, so the renderer never receives file-system, SQLite, Node, or raw IPC access.

## Install

```bash
pnpm install
```

The package expects Node 24.13 or newer and pnpm 11.18 or newer.

## Configuration

Each repository you open needs an `agent-learningops.config.json` at or above the selected repository root. Start with the bundled example:

```bash
cp agent-learningops.config.example.json /path/to/repository/agent-learningops.config.json
```

The schema is bundled as `config.schema.json` and exported from the package as `agent-learningops/config.schema.json`.

Example:

```json
{
    "$schema": "./config.schema.json",
    "schemaVersion": 1,
    "repositoryId": "example-repository",
    "learningGlobs": ["learning-artifacts/*.md"],
    "proposalGlobs": ["learning-artifacts/proposals/*-proposals.md"],
    "receiptGlobs": ["learning-artifacts/proposals/*-promoted.md"],
    "targets": [
        {
            "id": "local-standards",
            "adapter": "skill-reference",
            "path": "standards/learned-standards.md",
            "validators": [
                {
                    "command": "node",
                    "args": ["scripts/validate-standards.mjs"]
                }
            ]
        }
    ]
}
```

Target paths must stay repository-relative. Absolute paths, parent traversal, shell metacharacters, and symlink policy targets are rejected.

## Desktop Workflow

```bash
pnpm electron:start
```

1. Open an explicit local repository from the Setup view.
2. Import markdown learnings into the local SQLite state.
3. Cluster learnings and generate proposals.
4. Review each proposal item with an actor and rationale.
5. Preview patch manifests for configured targets.
6. Export proposal or receipt markdown.
7. Use Diagnostics to inspect state location, capabilities, targets, and audit events.

Safety model:

- The app previews diffs and exports markdown only.
- It does not apply patches.
- It does not commit, push, open pull requests, post externally, or mutate external systems.
- Decision recording requires both actor and rationale.
- Patch previews carry target hashes so stale or unapproved decisions can be detected before a human applies anything manually.

## CLI

```bash
pnpm cli -- init
pnpm cli -- import-markdown --json
pnpm cli -- cluster --json
pnpm cli -- propose --json
pnpm cli -- decision record --proposal <id> --item <id> --decision approve --actor <name> --reason <text>
pnpm cli -- patch preview --proposal <id> --target local-standards
pnpm cli -- export-markdown --proposal <id> --kind proposal --output /tmp/proposal.md
pnpm cli -- doctor --json
```

After building:

```bash
pnpm build
pnpm cli:built -- doctor --json
```

## MCP

The MCP server runs over stdio:

```bash
pnpm mcp -- --capabilities read
```

Capabilities:

- `read`: list/explain clusters, proposals, targets, and validate bundle metadata.
- `workflow`: build proposals and persist patch previews.
- `capture`: submit a learning into local state.
- `decision`: record one proposal-item decision.

There is no apply tool.

## Build And Package

```bash
CI=true pnpm typecheck
CI=true pnpm lint:js
CI=true pnpm test:unit
CI=true pnpm build
CI=true pnpm smoke:package-layout
CI=true pnpm package:mac:dir
CI=true pnpm smoke:package-layout
CI=true pnpm smoke:packaged-worker
```

The macOS package is written to `release/mac-arm64/Agent LearningOps.app` on Apple Silicon. Local packaging disables signing and notarization by setting `build.mac.identity` to `null`. The builder config also keeps `asar` disabled so the Electron worker can load the built ESM service graph through `worker_threads` without virtual-archive edge cases.

## Local State And Privacy

Agent LearningOps stores SQLite state locally. Set `LEARNINGOPS_STATE_DIR` to force a specific state directory for tests, demos, or shadow runs. Without an override, state is placed under the user-state directory and scoped by repository ID.

The desktop app reads files only from the repository you explicitly open and from paths declared by that repository config. No network sync, telemetry, remote upload, or external posting is built into the package.

## Troubleshooting

- `Could not find agent-learningops.config.json`: add the config file to the selected repository or select a directory below it.
- `Target escapes repository root`: replace absolute or parent-traversing target paths with repository-relative paths.
- `LearningOps worker exited`: run `CI=true pnpm test:unit -- test/electron-worker.spec.ts` and confirm Node 24.13 or newer is active.
- Blank packaged window: run `CI=true pnpm build` and confirm `dist/renderer/index.html` exists before `pnpm package:mac:dir`.
- Renderer cannot call backend: run `CI=true pnpm test:unit -- test/electron-shell.spec.ts` to validate preload exposure and trusted sender rules.
