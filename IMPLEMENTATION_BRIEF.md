# Agent LearningOps standalone desktop implementation

## Objective

Extract the existing untracked `@ms-app/agent-learningops` prototype from the `ms-app` monorepo into an independently installable, product-neutral standalone repository and implement the first-ranked dashboard stack from the 2026-08-03 analysis: Electron 43, Svelte 5, Vite, Skeleton 5, TanStack Table, and ECharts.

The desktop GUI is the primary human interface. The existing CLI and MCP server remain optional automation interfaces over the same application core and must not become the renderer's internal transport.

## Product outcomes

- A standalone repository named `agent-learningops` that installs, develops, tests, builds, and packages without any `ms-app` workspace packages or catalog configuration.
- A polished Svelte desktop dashboard with explicit repository selection, recent workspaces, health/capability status, learnings inbox, cluster exploration, proposal review and decision recording, patch preview/export, audit receipts, and diagnostics.
- Typed, narrow Electron IPC between an isolated renderer and the Node application layer.
- Existing local-first SQLite, repository path safety, decision rationale, patch-preview-only, and no-commit/push/post safety guarantees remain intact.
- The `ms-app` Markdown importer/exporter and example configuration remain compatibility adapters rather than the standalone product identity.
- CLI and MCP entry points continue to work from built JavaScript and are documented as optional expert/automation surfaces.

## Architecture invariants

1. The Electron renderer has `nodeIntegration: false`, `contextIsolation: true`, and no direct filesystem, SQLite, shell, process, or raw `ipcRenderer` access.
2. The preload bridge exposes explicit typed methods only. Every host request is validated before reaching the application service.
3. The dashboard calls a UI-independent application/query service directly through IPC; it never shells out to the CLI and never uses MCP internally.
4. SQLite and repository file access remain in the Node host/core boundary. Long-running workflow calls must not block the renderer and expose useful progress/error state.
5. Repository selection is explicit. The active repository is persistently and visibly identified, and config discovery is not silently based on the desktop process working directory.
6. No product action applies policy patches, commits, pushes, opens pull requests, or posts externally. Patch functionality remains preview/export only.
7. Proposal decisions require actor and rationale, and stale/unapproved items cannot become patch previews.
8. The extracted repository has no runtime or development dependency on `@ms-app/*`, pnpm workspace catalogs, or monorepo-relative TypeScript/ESLint/Vitest configurations.
9. The package manifest points only to emitted artifacts and includes a real JSON schema for repository configuration.
10. Core workflows, IPC validation/security boundaries, and principal dashboard states have automated regression coverage.

## UX priorities

- Use a desktop workspace shell with a persistent active-repository indicator and capability/safety badges.
- Optimize for the review path: inbox -> clusters -> proposal decisions -> patch preview -> receipts.
- Prefer master-detail tables, contextual empty states, keyboard-friendly actions, and disabled reasons over command syntax or raw JSON.
- Use TanStack Table for dense review collections and ECharts only for secondary status/trend summaries.
- Use Skeleton's design system and tokens to make the application coherent; do not introduce Vue or Ionic.
- Provide accessible labels, focus behavior, contrast, and reduced-motion-friendly transitions.

## Delivery and verification

- Use pnpm and the current Node 24 runtime.
- Provide development, typecheck, lint, unit-test, build, Electron launch, and package scripts.
- Package at least an unsigned macOS distributable locally; clearly document signing/update work that remains for public release.
- Verify the optional built CLI and MCP server with smoke tests.
- Run targeted tests, full typecheck/lint/test/build, the Ultragoal cleanup pass, post-cleaner verification, architecture invariant audit, and independent code-reviewer plus architect review before final completion.

## Source evidence

- Analysis: `/Users/gerrit.hoskins/.codex/worktrees/a2cb/ms-app/.ms-artifacts/analysis/agent-learningops-dashboard-stacks-20260803.md`
- Prototype: `/Users/gerrit.hoskins/WebstormProjects/ms-app/apps/agent-learningops`
- Prototype configuration: `/Users/gerrit.hoskins/WebstormProjects/ms-app/agent-learningops.config.json`

## Destination

`/Volumes/Samsung Evo970/projects/agent-learningops`
