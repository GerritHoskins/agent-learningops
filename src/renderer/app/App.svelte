<script lang="ts">
    import type { DashboardSnapshot } from '../../dashboard/session.js'
    import type { DecisionKind, Proposal } from '../../domain/schemas.js'
    import type { SortingState } from '@tanstack/table-core'
    import { onMount } from 'svelte'
    import {
        createClassificationChartOption,
        createDashboardTables,
        createMetricCards,
        formatFileName,
        getTableHeaders,
        type DashboardView,
    } from './dashboard-model.js'

    const views: Array<{ id: DashboardView; label: string }> = [
        { id: 'setup', label: 'Workspace' },
        { id: 'inbox', label: 'Inbox' },
        { id: 'clusters', label: 'Clusters' },
        { id: 'proposals', label: 'Proposals' },
        { id: 'decisions', label: 'Decisions' },
        { id: 'patches', label: 'Patches' },
        { id: 'receipts', label: 'Receipts' },
        { id: 'diagnostics', label: 'Diagnostics' },
    ]

    let activeView: DashboardView = 'setup'
    let repositoryRoot = ''
    let importSkill = ''
    let importSince = ''
    let learningFilter = ''
    let clusterFilter = ''
    let learningSortBy: 'skill' | 'ticket' | 'warnings' = 'skill'
    let decisionActor = ''
    let decisionRationale = ''
    let selectedProposalId = ''
    let selectedTargetId = ''
    let exportKind: 'proposal' | 'receipt' = 'proposal'
    let snapshot: DashboardSnapshot | undefined
    let busy = false
    let status = 'Select a repository to begin.'
    let error = ''
    let chartElement: HTMLDivElement | undefined
    let chart: import('echarts').ECharts | undefined
    let initChart: typeof import('echarts').init | undefined
    const defaultDecisionActor = 'dashboard-user'

    $: metrics = snapshot ? createMetricCards(snapshot) : []
    $: filteredClusters = snapshot ? filterClusters(snapshot.clusters, clusterFilter) : []
    $: visibleClusters = filteredClusters.slice(0, 50)
    $: activeViewLabel = views.find((view) => view.id === activeView)?.label ?? 'Dashboard'
    $: learningSorting = createLearningSorting(learningSortBy)
    $: tables = snapshot
        ? createDashboardTables(snapshot, {
              learningFilter,
              learningSorting,
              proposalSorting: [{ id: 'id', desc: true }],
              auditSorting: [{ id: 'at', desc: true }],
          })
        : undefined
    $: activeProposal = snapshot ? findActiveProposal(snapshot.proposals, selectedProposalId) : undefined
    $: availableTargets = snapshot?.repository.targets ?? []
    $: pendingProposalItem = activeProposal?.items.find(
        (item) =>
            (!selectedTargetId || item.targetId === selectedTargetId || !item.targetId) &&
            !hasDecision(snapshot, activeProposal.id, item.id),
    )
    $: canRecordDecision = Boolean(pendingProposalItem)
    $: approvedPatchItemCount = countApprovedPatchItems(snapshot, activeProposal, selectedTargetId)
    $: canPreviewPatch = Boolean(selectedProposalId && selectedTargetId && approvedPatchItemCount > 0)
    $: patchPreviewHint = createPatchPreviewHint(snapshot, activeProposal, selectedTargetId, approvedPatchItemCount)
    $: latestImportSummary = summarizeLatestImport(snapshot)
    $: if (snapshot && !selectedProposalId) {
        selectedProposalId = snapshot.proposals[0]?.id ?? ''
    }
    $: if (availableTargets.length > 0 && !selectedTargetId) {
        selectedTargetId = availableTargets[0]?.id ?? ''
    }
    $: syncClassificationChart(chartElement, snapshot, initChart)

    onMount(() => {
        let disposed = false
        void import('echarts').then((module) => {
            if (disposed) {
                return
            }

            initChart = module.init
        })
        const onResize = () => chart?.resize()
        window.addEventListener('resize', onResize)
        return () => {
            disposed = true
            window.removeEventListener('resize', onResize)
            chart?.dispose()
        }
    })

    async function selectRepository() {
        await runAction('Selecting repository', async () => {
            const selected = await window.learningOps.selectRepository()
            if (selected) {
                repositoryRoot = selected
                await openRepository()
            }
        })
    }

    async function openRepository() {
        await runAction('Opening repository', async () => {
            const opened = await window.learningOps.openRepository({ repositoryRoot })
            setSnapshot(opened, `Opened ${opened.repository.repositoryId}`, 'inbox')
        })
    }

    async function switchRepository() {
        await runAction('Switching repository', async () => {
            const switched = await window.learningOps.switchRepository({ repositoryRoot })
            setSnapshot(switched, `Switched to ${switched.repository.repositoryId}`, 'inbox')
        })
    }

    async function closeRepository() {
        await runAction('Closing repository', async () => {
            await window.learningOps.closeRepository()
            snapshot = undefined
            selectedProposalId = ''
            selectedTargetId = ''
            status = 'Repository closed.'
            activeView = 'setup'
        })
    }

    async function refreshSnapshot() {
        await runAction('Refreshing snapshot', async () => {
            setSnapshot(await window.learningOps.getSnapshot(), 'Snapshot refreshed.')
        })
    }

    async function importMarkdown() {
        await runAction('Importing learnings', async () => {
            const imported = await window.learningOps.importMarkdown({
                ...(importSkill ? { skill: importSkill } : {}),
                ...(importSince ? { since: importSince } : {}),
            })
            setSnapshot(imported, `Imported ${imported.overview.counts.learnings} learnings.`)
        })
    }

    async function clusterLearnings() {
        await runAction('Clustering learnings', async () => {
            const clustered = await window.learningOps.clusterLearnings()
            setSnapshot(clustered, `Built ${clustered.overview.counts.clusters} clusters.`, 'clusters')
        })
    }

    async function proposeLearnings() {
        await runAction('Creating proposal', async () => {
            const result = await window.learningOps.proposeLearnings()
            setSnapshot(result.snapshot, `Created ${result.proposal.id}.`, 'proposals')
            selectedProposalId = result.proposal.id
        })
    }

    async function recordDecision(decision: DecisionKind) {
        if (!activeProposal || !pendingProposalItem || !canRecordDecision) {
            error = 'Actor and rationale are required before recording a decision.'
            return
        }
        await runAction('Recording decision', async () => {
            const decided = await window.learningOps.recordProposalDecision({
                proposalId: activeProposal.id,
                itemId: pendingProposalItem.id,
                decision,
                actor: decisionActor.trim() || defaultDecisionActor,
                rationale: decisionRationale.trim() || defaultDecisionRationale(decision, pendingProposalItem.ruleText),
            })
            decisionRationale = ''
            setSnapshot(decided, `Recorded ${decision} for ${pendingProposalItem.id}.`, 'decisions')
        })
    }

    async function previewPatch() {
        if (!canPreviewPatch) {
            error = patchPreviewHint
            return
        }
        await runAction('Previewing patch', async () => {
            const result = await window.learningOps.previewPatch({
                proposalId: selectedProposalId,
                targetId: selectedTargetId,
            })
            setSnapshot(result.snapshot, `Previewed patch ${result.patch.id}.`, 'patches')
        })
    }

    async function exportMarkdown() {
        if (!selectedProposalId) {
            return
        }
        await runAction('Exporting markdown', async () => {
            const result = await window.learningOps.exportMarkdown({
                proposalId: selectedProposalId,
                kind: exportKind,
            })
            if (!result) {
                status = 'Export cancelled.'
                return
            }
            setSnapshot(result.snapshot, `Exported ${result.bytes} bytes to ${result.output}.`, 'receipts')
        })
    }

    function setSnapshot(nextSnapshot: DashboardSnapshot, nextStatus: string, nextView?: DashboardView) {
        snapshot = nextSnapshot
        status = nextStatus
        if (nextView) {
            selectView(nextView)
        }
    }

    function selectView(view: DashboardView) {
        activeView = view
        error = ''
    }

    async function runAction(label: string, action: () => Promise<void>) {
        busy = true
        error = ''
        status = `${label}...`
        try {
            await action()
        } catch (caught) {
            error = caught instanceof Error ? caught.message : String(caught)
            status = 'Action failed.'
        } finally {
            busy = false
        }
    }

    function findActiveProposal(proposals: Proposal[], id: string): Proposal | undefined {
        return proposals.find((proposal) => proposal.id === id) ?? proposals[0]
    }

    function hasDecision(nextSnapshot: DashboardSnapshot | undefined, proposalId: string, itemId: string): boolean {
        return Boolean(
            nextSnapshot?.decisions.some((decision) => decision.proposalId === proposalId && decision.itemId === itemId),
        )
    }

    function defaultDecisionRationale(decision: DecisionKind, ruleText: string): string {
        const action = decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Deferred'
        return `${action} from the dashboard review queue: ${ruleText}`
    }

    function countApprovedPatchItems(
        nextSnapshot: DashboardSnapshot | undefined,
        proposal: Proposal | undefined,
        targetId: string,
    ): number {
        if (!nextSnapshot || !proposal || !targetId) {
            return 0
        }

        return proposal.items.filter((item) =>
            nextSnapshot.decisions.some(
                (decision) =>
                    decision.proposalId === proposal.id &&
                    decision.itemId === item.id &&
                    decision.decision === 'approve' &&
                    !decision.stale &&
                    (decision.targetId ?? item.targetId) === targetId,
            ),
        ).length
    }

    function createPatchPreviewHint(
        nextSnapshot: DashboardSnapshot | undefined,
        proposal: Proposal | undefined,
        targetId: string,
        approvedCount: number,
    ): string {
        if (!nextSnapshot || !proposal) {
            return 'Create a proposal before previewing a patch.'
        }

        if (!targetId) {
            return 'Select a target before previewing a patch.'
        }

        if (approvedCount === 0) {
            return 'Approve at least one non-stale proposal item for this target before previewing a patch.'
        }

        return `${approvedCount} approved item(s) ready for patch preview.`
    }

    function summarizeLatestImport(nextSnapshot: DashboardSnapshot | undefined): string {
        const event = nextSnapshot?.auditEvents.find((candidate) => candidate.type === 'import-markdown')
        if (!event) {
            return ''
        }

        const scanned = Number(event.data.scannedCount ?? 0)
        const imported = Number(event.data.learningCount ?? 0)
        const skipped = Number(event.data.skippedCount ?? 0)
        const duplicates = Number(event.data.duplicateCount ?? 0)
        const warnings = Number(event.data.warningCount ?? 0)

        return `Scanned ${scanned}, imported ${imported}, skipped ${skipped}, duplicates ${duplicates}, warnings ${warnings}.`
    }

    function filterClusters(clusters: DashboardSnapshot['clusters'], filter: string): DashboardSnapshot['clusters'] {
        const normalizedFilter = filter.trim().toLowerCase()
        if (!normalizedFilter) {
            return clusters
        }

        return clusters.filter(
            (cluster) =>
                cluster.representativeText.toLowerCase().includes(normalizedFilter) ||
                cluster.explanation.toLowerCase().includes(normalizedFilter),
        )
    }

    function syncClassificationChart(
        element: HTMLDivElement | undefined,
        nextSnapshot: DashboardSnapshot | undefined,
        init: typeof import('echarts').init | undefined,
    ): void {
        if (!init) {
            return
        }

        if (!element) {
            chart?.dispose()
            chart = undefined
            return
        }

        chart ??= init(element)
        if (nextSnapshot) {
            chart.setOption(createClassificationChartOption(nextSnapshot))
        }
    }

    function createLearningSorting(sortBy: typeof learningSortBy): SortingState {
        if (sortBy === 'warnings') {
            return [{ id: 'warnings', desc: true }]
        }
        return [{ id: sortBy, desc: false }]
    }
</script>

<svelte:head>
    <title>Agent LearningOps</title>
    <meta
        name="description"
        content="Standalone desktop dashboard for reviewing learnings, proposals, decisions, patch previews, and receipts."
    />
</svelte:head>

<main class="dashboard-shell">
    <aside class="sidebar">
        <div class="brand">
            <span class="brand-mark">AL</span>
            <div>
                <p class="eyebrow">Standalone</p>
                <h1>Agent LearningOps</h1>
            </div>
        </div>

        <div class="safety-stack" aria-label="Safety posture">
            <span>Read-only apply</span>
            <span>Typed preload</span>
            <span>No raw IPC</span>
        </div>

        <nav class="nav-list" aria-label="Dashboard sections">
            {#each views as view}
                <button class:active={activeView === view.id} type="button" on:click={() => selectView(view.id)}>
                    {view.label}
                </button>
            {/each}
        </nav>

        {#if snapshot}
            <div class="repository-chip">
                <span>{snapshot.repository.repositoryId}</span>
                <code>{snapshot.repository.repositoryRoot}</code>
                <small>{snapshot.repository.targetCount} target(s)</small>
            </div>
        {/if}
    </aside>

    <section class="workbench">
        <header class="topbar">
            <div>
                <p class="eyebrow">Learning workflow</p>
                <h2>{activeViewLabel}</h2>
            </div>
            <div class="status-strip" aria-live="polite">
                <span class:busy>{busy ? 'Working' : 'Ready'}</span>
                <p>{status}</p>
            </div>
        </header>

        {#if error}
            <div class="alert" role="alert">{error}</div>
        {/if}

        {#if activeView === 'setup'}
            <section class="panel setup-grid">
                <div>
                    <p class="eyebrow">Repository</p>
                    <h3>Open a local repository</h3>
                    <p class="muted">
                        Select an explicit repository. This dashboard previews, exports, and records receipts only; it never
                        applies patches, commits, pushes, or posts.
                    </p>
                    <div class="badge-row">
                        <span>Local-first</span>
                        <span>Standalone package</span>
                        <span>Reviewer approved decisions</span>
                    </div>
                </div>
                <form class="path-form" on:submit|preventDefault={snapshot ? switchRepository : openRepository}>
                    <label for="repository-root">Repository root</label>
                    <div class="input-row">
                        <input id="repository-root" bind:value={repositoryRoot} placeholder="/path/to/repository" />
                        <button type="button" class="secondary" disabled={busy} on:click={selectRepository}>Browse</button>
                    </div>
                    <div class="button-row">
                        <button type="submit" disabled={busy || !repositoryRoot}>
                            {snapshot ? 'Switch repository' : 'Open repository'}
                        </button>
                        <button type="button" class="secondary" disabled={busy || !snapshot} on:click={closeRepository}>
                            Close
                        </button>
                        <button type="button" class="secondary" disabled={busy || !snapshot} on:click={refreshSnapshot}>
                            Refresh
                        </button>
                    </div>
                </form>
            </section>
        {:else if snapshot}
            <section class="metric-grid" aria-label="Repository metrics">
                {#each metrics as metric}
                    <article class="metric-card">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                        <small>{metric.detail}</small>
                    </article>
                {/each}
            </section>

            {#if activeView === 'inbox'}
                <section class="repository-grid">
                    <article class="panel">
                        <div class="section-heading">
                            <div>
                                <p class="eyebrow">Capture</p>
                                <h3>Learning inbox</h3>
                            </div>
                            <button type="button" disabled={busy} on:click={importMarkdown}>Import</button>
                        </div>
                        <div class="filters">
                            <label>
                                Skill
                                <input bind:value={importSkill} placeholder="local-plan" />
                            </label>
                            <label>
                                Since
                                <input bind:value={importSince} placeholder="2026-08-01" />
                            </label>
                            <label>
                                Filter table
                                <input bind:value={learningFilter} placeholder="skill, ticket, source" />
                            </label>
                            <label>
                                Sort
                                <select bind:value={learningSortBy}>
                                    <option value="skill">Skill A-Z</option>
                                    <option value="ticket">Ticket A-Z</option>
                                    <option value="warnings">Warnings high first</option>
                                </select>
                            </label>
                        </div>
                        {#if latestImportSummary}
                            <p class="form-hint">{latestImportSummary}</p>
                        {/if}
                        {#if tables && tables.learningRows.length > 0}
                            <table>
                                <thead>
                                    <tr>
                                        {#each getTableHeaders(tables.learningTable) as header}
                                            <th>{header}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each tables.learningRows as row}
                                        <tr>
                                            <td>{row.skill}</td>
                                            <td>{row.ticket}</td>
                                            <td>{row.source}</td>
                                            <td>{row.warnings}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No learnings in scope</h3>
                                <p>Import markdown learnings or loosen the table filter.</p>
                            </div>
                        {/if}
                    </article>
                    <article class="panel chart-panel">
                        <div>
                            <p class="eyebrow">Classification</p>
                            <h3>Proposal mix</h3>
                        </div>
                        <div bind:this={chartElement} class="chart" aria-label="Classification chart"></div>
                    </article>
                </section>
            {:else if activeView === 'clusters'}
                <section class="panel">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Normalize</p>
                            <h3>Clusters</h3>
                        </div>
                        <button type="button" disabled={busy} on:click={clusterLearnings}>Cluster</button>
                    </div>
                    <div class="filters">
                        <label>
                            Filter clusters
                            <input bind:value={clusterFilter} placeholder="modal, storage, testing" />
                        </label>
                    </div>
                    <p class="form-hint">Showing {visibleClusters.length} of {filteredClusters.length} cluster(s).</p>
                    <div class="list-grid">
                        {#each visibleClusters as cluster}
                            <article class="item-card">
                                <strong>{cluster.representativeText}</strong>
                                <small>{cluster.members.length} evidence item(s)</small>
                                <p>{cluster.needsReview ? 'Needs review' : 'Ready'}</p>
                            </article>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No clusters yet</h3>
                                <p>Run clustering after importing learnings.</p>
                            </div>
                        {/each}
                    </div>
                </section>
            {:else if activeView === 'proposals'}
                <section class="repository-grid">
                    <article class="panel">
                        <div class="section-heading">
                            <div>
                                <p class="eyebrow">Review</p>
                                <h3>Proposals</h3>
                            </div>
                            <button type="button" disabled={busy} on:click={proposeLearnings}>Propose</button>
                        </div>
                        {#if tables && tables.proposalRows.length > 0}
                            <table>
                                <thead>
                                    <tr>
                                        {#each getTableHeaders(tables.proposalTable) as header}
                                            <th>{header}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each tables.proposalRows as row}
                                        <tr>
                                            <td>
                                                <button
                                                    class="link-button"
                                                    type="button"
                                                    on:click={() => (selectedProposalId = row.id)}
                                                >
                                                    {row.id}
                                                </button>
                                            </td>
                                            <td>{row.items}</td>
                                            <td>{row.promote}</td>
                                            <td>{row.needsVerification}</td>
                                            <td>{row.skip}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No proposals yet</h3>
                                <p>Create a proposal from clustered learnings.</p>
                            </div>
                        {/if}
                    </article>
                    <article class="panel">
                        <p class="eyebrow">Decision queue</p>
                        {#if availableTargets.length > 0}
                            <label>
                                Target
                                <select bind:value={selectedTargetId}>
                                    {#each availableTargets as target}
                                        <option value={target.id}>{target.id}</option>
                                    {/each}
                                </select>
                            </label>
                        {/if}
                        {#if pendingProposalItem}
                            <h3>{pendingProposalItem.ruleText}</h3>
                            <p class="muted">{pendingProposalItem.rationale}</p>
                            <label>
                                Actor
                                <input bind:value={decisionActor} placeholder="gerrit" />
                            </label>
                            <label>
                                Rationale
                                <textarea bind:value={decisionRationale} rows="4" placeholder="Why this decision is correct"></textarea>
                            </label>
                            <div class="button-row">
                                <button type="button" disabled={busy || !canRecordDecision} on:click={() => recordDecision('approve')}>
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    class="secondary"
                                    disabled={busy || !canRecordDecision}
                                    on:click={() => recordDecision('reject')}
                                >
                                    Reject
                                </button>
                                <button
                                    type="button"
                                    class="secondary"
                                    disabled={busy || !canRecordDecision}
                                    on:click={() => recordDecision('defer')}
                                >
                                    Defer
                                </button>
                            </div>
                            <p class="form-hint">Blank fields use dashboard defaults; custom actor and rationale are preserved.</p>
                        {:else}
                            <h3>No pending proposal item</h3>
                            <p class="muted">Create a proposal or select one with undecided items.</p>
                        {/if}
                    </article>
                </section>
            {:else if activeView === 'decisions'}
                <section class="panel">
                    <p class="eyebrow">Receipts</p>
                    <h3>Recorded decisions</h3>
                    <div class="list-grid">
                        {#each snapshot.decisions as decision}
                            <article class="item-card">
                                <strong>{decision.decision}</strong>
                                <small>{decision.actor} at {decision.decidedAt}</small>
                                <p>{decision.rationale}</p>
                            </article>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No decisions recorded</h3>
                                <p>Review proposal items to create signed receipts.</p>
                            </div>
                        {/each}
                    </div>
                </section>
            {:else if activeView === 'patches'}
                <section class="panel">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Apply planning</p>
                            <h3>Patch previews</h3>
                        </div>
                        <button type="button" disabled={busy || !canPreviewPatch} on:click={previewPatch}>
                            Preview
                        </button>
                    </div>
                    <div class="filters">
                        <label>
                            Proposal
                            <select bind:value={selectedProposalId}>
                                {#each snapshot.proposals as proposal}
                                    <option value={proposal.id}>{proposal.id}</option>
                                {/each}
                            </select>
                        </label>
                        <label>
                            Target
                            <select bind:value={selectedTargetId}>
                                {#each availableTargets as target}
                                    <option value={target.id}>{target.id}</option>
                                {/each}
                            </select>
                        </label>
                    </div>
                    <p class="form-hint">{patchPreviewHint}</p>
                    <div class="diff-list">
                        {#each snapshot.patchPreviews as patch}
                            <article class="diff-card">
                                <strong>{patch.targetPath}</strong>
                                <pre>{patch.unifiedDiff}</pre>
                            </article>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No patch previews</h3>
                                <p>Select a proposal and target, then preview the diff.</p>
                            </div>
                        {/each}
                    </div>
                </section>
            {:else if activeView === 'receipts'}
                <section class="panel">
                    <div class="section-heading">
                        <div>
                            <p class="eyebrow">Export</p>
                            <h3>Markdown receipts</h3>
                        </div>
                        <button type="button" disabled={busy || !selectedProposalId} on:click={exportMarkdown}>
                            Export
                        </button>
                    </div>
                    <div class="filters">
                        <label>
                            Kind
                            <select bind:value={exportKind}>
                                <option value="proposal">Proposal</option>
                                <option value="receipt">Receipt</option>
                            </select>
                        </label>
                    </div>
                    <div class="list-grid">
                        {#each snapshot.decisions as decision}
                            <article class="item-card">
                                <strong>{decision.proposalId}</strong>
                                <small>{decision.decision} by {decision.actor}</small>
                                <p>{decision.rationale}</p>
                            </article>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No receipts available</h3>
                                <p>Record proposal decisions before exporting receipts.</p>
                            </div>
                        {/each}
                    </div>
                </section>
            {:else if activeView === 'diagnostics'}
                <section class="repository-grid">
                    <article class="panel">
                        <p class="eyebrow">Health</p>
                        <h3>{snapshot.health.repositoryId}</h3>
                        <dl class="definition-list">
                            <div><dt>State directory</dt><dd>{snapshot.repository.stateDirectory}</dd></div>
                            <div><dt>Targets</dt><dd>{snapshot.repository.targetCount}</dd></div>
                            <div><dt>Capabilities</dt><dd>{snapshot.repository.capabilities.join(', ')}</dd></div>
                        </dl>
                    </article>
                    <article class="panel">
                        <p class="eyebrow">Audit</p>
                        <h3>Recent events</h3>
                        {#if tables && tables.auditRows.length > 0}
                            <table>
                                <thead>
                                    <tr>
                                        {#each getTableHeaders(tables.auditTable) as header}
                                            <th>{header}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each tables.auditRows as row}
                                        <tr>
                                            <td>{row.at}</td>
                                            <td>{row.type}</td>
                                            <td>{row.summary}</td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        {:else}
                            <div class="empty-state compact">
                                <h3>No audit events</h3>
                                <p>Repository workflow activity will appear here.</p>
                            </div>
                        {/if}
                    </article>
                </section>
            {/if}
        {:else}
            <section class="panel empty-state">
                <h3>No repository open</h3>
                <p>Open a repository from Setup before using the dashboard.</p>
                <button type="button" on:click={() => (activeView = 'setup')}>Open repository</button>
            </section>
        {/if}
    </section>
</main>
