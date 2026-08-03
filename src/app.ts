import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { buildDeterministicClusters } from './clustering/deterministic-clusterer.js'
import { findRepositoryRoot, loadConfig } from './config/schema.js'
import { resolveStateDirectory } from './config/state-dir.js'
import { recordDecision } from './decisions/decision-service.js'
import { contentId, fileHash } from './domain/ids.js'
import type { Capability, Decision, DecisionKind, Evidence, Learning, LearningOpsConfig, Proposal } from './domain/schemas.js'
import { exportProposalMarkdown } from './exporters/proposal-markdown.js'
import { exportReceiptMarkdown } from './exporters/receipt-markdown.js'
import { importLearningMarkdown } from './importers/learning-markdown.js'
import { previewPolicyPatch } from './policies/patch-service.js'
import { readTargetContent } from './policies/target-registry.js'
import { buildProposal } from './proposals/proposal-service.js'
import type { LearningStore } from './storage/learning-store.js'
import { SqliteLearningStore } from './storage/sqlite-store.js'

export interface LearningOpsApp {
    repositoryRoot: string
    config: LearningOpsConfig
    store: LearningStore
    close(): Promise<void>
}

export async function createLearningOpsApp(repositoryRoot = process.cwd()): Promise<LearningOpsApp> {
    const resolvedRoot = await findRepositoryRoot(repositoryRoot)
    const config = await loadConfig(resolvedRoot)
    const stateDirectory = resolveStateDirectory(config, resolvedRoot)
    const store = new SqliteLearningStore(join(stateDirectory, 'learningops.sqlite'))
    await store.initialize()

    return {
        repositoryRoot: resolvedRoot,
        config,
        store,
        async close() {
            await store.close()
        },
    }
}

export async function initApp(app: LearningOpsApp): Promise<{ repositoryId: string; state: string }> {
    const stateDirectory = resolveStateDirectory(app.config, app.repositoryRoot)
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
    return { repositoryId: app.config.repositoryId, state: stateDirectory }
}

export async function importMarkdown(app: LearningOpsApp, options: { since?: string; skill?: string } = {}) {
    const result = await importLearningMarkdown(app.repositoryRoot, app.config, options)
    result.diagnostics.push(
        ...(await missingConfiguredArtifactDirectories(app.repositoryRoot, [
            ...app.config.proposalGlobs,
            ...app.config.receiptGlobs,
        ])),
    )
    const eventAt = new Date().toISOString()

    if (isFullImport(options)) {
        await app.store.replaceImportedSnapshot(app.config.repositoryId, result.learnings, result.evidence)
    } else {
        for (const learning of result.learnings) {
            await app.store.putLearning(learning)
        }
        for (const evidence of result.evidence) {
            await app.store.putEvidence(evidence)
        }
    }

    await app.store.appendEvent({
        schemaVersion: 1,
        id: contentId('event', { type: 'import', at: eventAt, count: result.learnings.length, options }),
        repositoryId: app.config.repositoryId,
        type: 'import-markdown',
        subjectId: app.config.repositoryId,
        at: eventAt,
        data: {
            mode: isFullImport(options) ? 'replace' : 'incremental',
            scannedCount: result.scannedCount,
            learningCount: result.learnings.length,
            evidenceCount: result.evidence.length,
            skippedCount: result.skippedCount,
            duplicateCount: result.duplicateCount,
            warningCount: result.warningCount,
            diagnostics: result.diagnostics,
            skippedFiles: result.skippedFiles,
        },
    })
    return result
}

async function missingConfiguredArtifactDirectories(repositoryRoot: string, globs: string[]): Promise<string[]> {
    const diagnostics: string[] = []
    for (const glob of globs) {
        const directory = resolve(repositoryRoot, dirname(glob))
        try {
            await access(directory)
        } catch {
            diagnostics.push(`missing_configured_artifact_directory:${dirname(glob)}`)
        }
    }
    return diagnostics
}

export async function submitLearning(
    app: LearningOpsApp,
    input: { text: string; skill?: string; ticket?: string },
): Promise<{ id: string; status: 'captured'; learningId: string; evidenceId: string }> {
    const rawText = input.text.trim()
    if (!rawText) {
        throw new Error('Learning text must not be empty')
    }

    const now = new Date().toISOString()
    const sourcePath = `mcp://submitted/${contentId('source', {
        repositoryId: app.config.repositoryId,
        rawText,
        skill: input.skill,
        ticket: input.ticket,
    })}.md`
    const sourceHash = fileHash(rawText)
    const learningId = contentId('learning', {
        repositoryId: app.config.repositoryId,
        sourcePath,
        sourceHash,
    })
    const evidenceId = contentId('evidence', { repositoryId: app.config.repositoryId, learningId, rawText })
    const lineageId = contentId('lineage', { repositoryId: app.config.repositoryId, sourcePath })
    const learning: Learning = {
        schemaVersion: 1,
        id: learningId,
        repositoryId: app.config.repositoryId,
        sourcePath,
        sourceHash,
        contentHash: sourceHash,
        ...(input.skill ? { skill: input.skill } : {}),
        ...(input.ticket ? { ticket: input.ticket } : {}),
        rawText,
        candidateRules: [rawText],
        warnings: [],
        importedAt: now,
    }
    const evidence: Evidence = {
        id: evidenceId,
        learningId,
        repositoryId: app.config.repositoryId,
        sourcePath,
        sourceHash,
        canonicalLineageId: lineageId,
        ...(input.skill ? { skill: input.skill } : {}),
        ...(input.ticket ? { ticket: input.ticket } : {}),
        rawFragment: rawText,
    }

    await app.store.putLearning(learning)
    await app.store.putEvidence(evidence)
    await app.store.appendEvent({
        schemaVersion: 1,
        id: contentId('event', { type: 'capture-mcp', at: now, learningId }),
        repositoryId: app.config.repositoryId,
        type: 'capture-mcp',
        subjectId: learningId,
        at: now,
        data: { source: 'mcp', skill: input.skill ?? '', ticket: input.ticket ?? '' },
    })

    return { id: learningId, status: 'captured', learningId, evidenceId }
}

export async function clusterLearnings(app: LearningOpsApp) {
    const evidence = await app.store.listEvidence(app.config.repositoryId)
    const result = buildDeterministicClusters(app.config.repositoryId, evidence)
    await app.store.replaceClusters(app.config.repositoryId, result.clusters)
    await appendWorkflowEvent(app, 'cluster', app.config.repositoryId, { clusterCount: result.clusters.length })
    return result
}

export async function proposeLearnings(app: LearningOpsApp): Promise<Proposal> {
    const clusters = await app.store.listClusters(app.config.repositoryId)
    const evidence = await app.store.listEvidence(app.config.repositoryId)
    const proposal = buildProposal({
        repositoryId: app.config.repositoryId,
        clusters,
        evidence,
        targets: app.config.targets,
    })
    const proposalWithTargetHashes: Proposal = {
        ...proposal,
        items: await Promise.all(
            proposal.items.map(async (item) => {
                if (!item.targetId) {
                    return item
                }

                const target = app.config.targets.find((candidate) => candidate.id === item.targetId)
                if (!target) {
                    return item
                }

                return {
                    ...item,
                    targetBaseHash: fileHash(await readTargetContent(app.repositoryRoot, target)),
                }
            }),
        ),
    }

    await app.store.putProposal(proposalWithTargetHashes)
    await appendWorkflowEvent(app, 'proposal-create', proposalWithTargetHashes.id, {
        itemCount: proposalWithTargetHashes.items.length,
    })
    return proposalWithTargetHashes
}

function isFullImport(options: { since?: string; skill?: string }): boolean {
    return !options.since && !options.skill
}

export async function recordProposalDecision(
    app: LearningOpsApp,
    input: { proposalId: string; itemId: string; decision: DecisionKind; actor: string; rationale: string; now?: string },
) {
    const proposal = await requireProposal(app, input.proposalId)
    const item = proposal.items.find((candidate) => candidate.id === input.itemId)
    const target = item?.targetId ? app.config.targets.find((candidate) => candidate.id === item.targetId) : undefined
    const decision = recordDecision({
        proposal,
        itemId: input.itemId,
        decision: input.decision,
        actor: input.actor,
        rationale: input.rationale,
        ...(input.now ? { now: input.now } : {}),
        ...(target ? { targetBaseHash: fileHash(await readTargetContent(app.repositoryRoot, target)) } : {}),
    })
    await app.store.putDecision(decision)
    await appendWorkflowEvent(app, 'decision', decision.itemId, {
        proposalId: decision.proposalId,
        decision: decision.decision,
        actor: decision.actor,
    })
    return decision
}

export async function previewPatch(app: LearningOpsApp, input: { proposalId: string; targetId: string }) {
    const proposal = await requireProposal(app, input.proposalId)
    const decisions = await listCurrentDecisions(app)
    const patch = await previewPolicyPatch({
        repositoryRoot: app.repositoryRoot,
        config: app.config,
        proposal,
        decisions,
        targetId: input.targetId,
    })
    await app.store.putPatch(patch)
    await appendWorkflowEvent(app, 'patch-preview', input.targetId, { proposalId: input.proposalId, patchId: patch.id })
    return patch
}

export async function listCurrentDecisions(app: LearningOpsApp): Promise<Decision[]> {
    const decisions = await app.store.listDecisions(app.config.repositoryId)
    return Promise.all(
        decisions.map(async (decision) => {
            if (!decision.targetId || !decision.targetBaseHash) {
                return decision
            }

            const target = app.config.targets.find((candidate) => candidate.id === decision.targetId)
            if (!target) {
                return { ...decision, stale: true }
            }

            let currentHash: string
            try {
                currentHash = fileHash(await readTargetContent(app.repositoryRoot, target))
            } catch {
                return { ...decision, stale: true }
            }
            const current = { ...decision, stale: currentHash !== decision.targetBaseHash }
            if (current.stale !== decision.stale) {
                await app.store.putDecision(current)
            }
            return current
        }),
    )
}

export async function exportMarkdown(
    app: LearningOpsApp,
    input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string },
) {
    const proposal = await requireProposal(app, input.proposalId)
    const content =
        input.kind === 'proposal'
            ? exportProposalMarkdown(proposal, await app.store.listEvidence(app.config.repositoryId))
            : exportReceiptMarkdown(proposal, await listCurrentDecisions(app))
    await writeFile(input.output, content, { mode: 0o600 })
    await appendWorkflowEvent(app, 'export', input.kind, { proposalId: input.proposalId, output: input.output })
    return { output: input.output, bytes: Buffer.byteLength(content) }
}

async function appendWorkflowEvent(app: LearningOpsApp, type: string, subjectId: string, data: Record<string, unknown>) {
    const at = new Date().toISOString()
    await app.store.appendEvent({
        schemaVersion: 1,
        id: contentId('event', { type, subjectId, at, data }),
        repositoryId: app.config.repositoryId,
        type,
        subjectId,
        at,
        data,
    })
}

export async function doctor(app: LearningOpsApp) {
    const stateDirectory = resolveStateDirectory(app.config, app.repositoryRoot)
    return {
        repositoryId: app.config.repositoryId,
        node: process.version,
        stateDirectory,
        targetCount: app.config.targets.length,
        capabilities: ['read', 'workflow', 'capture', 'decision'] satisfies Capability[],
    }
}

async function requireProposal(app: LearningOpsApp, proposalId: string): Promise<Proposal> {
    const proposal = await app.store.getProposal(proposalId)
    if (!proposal) {
        throw new Error(`Unknown proposal: ${proposalId}`)
    }

    return proposal
}
