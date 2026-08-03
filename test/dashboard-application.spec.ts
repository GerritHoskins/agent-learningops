import {
    createDashboardSession,
    createLearningOpsApp,
    createLearningOpsDesktopApplication,
    validateRepositorySelection,
} from '../src/index.js'
import { createFixtureRepo } from './helpers/tmp.js'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

describe('dashboard application facade', () => {
    afterEach(() => {
        delete process.env.LEARNINGOPS_STATE_DIR
    })

    it('requires explicit repository selection and does not expose storage directly', async () => {
        const app = createLearningOpsDesktopApplication()

        await expect(app.getSnapshot()).rejects.toThrow(/Select a repository first/)
        await expect(app.openRepository({ repositoryRoot: '   ' })).rejects.toThrow(/repositoryRoot/)

        const invalid = await validateRepositorySelection({ repositoryRoot: '   ' })
        expect(invalid.ok).toBe(false)

        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-state-'))
        const snapshot = await app.openRepository({ repositoryRoot: root })

        expect(snapshot.repository.repositoryRoot).toBe(root)
        expect(snapshot.repository.repositoryId).toBe('fixture')
        expect(snapshot.repository.targetCount).toBe(1)
        expect(Object.hasOwn(snapshot, 'store')).toBe(false)
        expect(Object.hasOwn(app, 'store')).toBe(false)

        await app.closeRepository()
        await expect(app.getSnapshot()).rejects.toThrow(/Select a repository first/)
    })

    it('supports switching repositories while keeping snapshots scoped to the selected root', async () => {
        const firstRoot = await createFixtureRepo()
        const secondRoot = await createFixtureRepo()
        const app = createLearningOpsDesktopApplication()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-switch-state-'))

        const first = await app.openRepository({ repositoryRoot: firstRoot })
        expect(first.repository.repositoryRoot).toBe(firstRoot)

        const second = await app.switchRepository({ repositoryRoot: secondRoot })
        expect(second.repository.repositoryRoot).toBe(secondRoot)
        expect(second.repository.repositoryId).toBe('fixture')

        await app.closeRepository()
    })

    it('does not keep a stale repository open when switching to an invalid selection fails', async () => {
        const root = await createFixtureRepo()
        const app = createLearningOpsDesktopApplication()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-failed-switch-state-'))

        await app.openRepository({ repositoryRoot: root })
        await expect(app.switchRepository({ repositoryRoot: '   ' })).rejects.toThrow(/repositoryRoot/)
        await expect(app.getSnapshot()).rejects.toThrow(/Select a repository first/)
    })

    it('returns a coherent snapshot and audit events for workflow commands', async () => {
        const root = await createFixtureRepo()
        const app = createLearningOpsDesktopApplication()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-flow-state-'))

        await app.openRepository({ repositoryRoot: root })
        const imported = await app.importMarkdown()
        expect(imported.overview.counts.learnings).toBe(2)
        expect(imported.auditEvents).toHaveLength(1)
        expect(imported.auditEvents[0]?.type).toBe('import-markdown')

        const clustered = await app.clusterLearnings()
        expect(clustered.overview.counts.clusters).toBe(1)

        const { proposal, snapshot: proposed } = await app.proposeLearnings()
        expect(proposed.overview.counts.proposals).toBe(1)
        expect(proposed.overview.classificationCounts.PROMOTE).toBe(1)

        await expect(
            app.recordProposalDecision({
                proposalId: proposal.id,
                itemId: proposal.items[0]?.id ?? '',
                decision: 'approve',
                actor: '',
                rationale: 'missing actor should fail',
            }),
        ).rejects.toThrow(/Decision actor/)

        const decided = await app.recordProposalDecision({
            proposalId: proposal.id,
            itemId: proposal.items[0]?.id ?? '',
            decision: 'approve',
            actor: 'test',
            rationale: 'fixture approval',
        })
        expect(decided.decisions).toHaveLength(1)

        const { patch, snapshot: previewed } = await app.previewPatch({
            proposalId: proposal.id,
            targetId: 'skill-local-standards',
        })
        expect(patch.unifiedDiff).toContain('Verify target hashes before patch preview')
        expect(previewed.patchPreviews).toHaveLength(1)

        const exported = await app.exportMarkdown({
            proposalId: proposal.id,
            kind: 'receipt',
            output: join(root, 'receipt.md'),
        })
        expect(exported.bytes).toBeGreaterThan(0)
        expect(await readFile(join(root, 'receipt.md'), 'utf8')).toContain('fixture approval')

        await app.closeRepository()
    })
})

describe('dashboard session query models', () => {
    afterEach(() => {
        delete process.env.LEARNINGOPS_STATE_DIR
    })

    it('builds proposal review models and receipts without exposing the store', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-session-state-'))
        const session = await createDashboardSession({ repositoryRoot: root })

        try {
            expect(Object.hasOwn(session, 'store')).toBe(false)
            await session.importMarkdown()
            await session.clusterLearnings()
            const proposal = await session.proposeLearnings()
            await session.recordProposalDecision({
                proposalId: proposal.id,
                itemId: proposal.items[0]?.id ?? '',
                decision: 'approve',
                actor: 'test',
                rationale: 'session approval',
            })
            await session.previewPatch({ proposalId: proposal.id, targetId: 'skill-local-standards' })

            const review = await session.getProposalReview(proposal.id)
            expect(review.items).toHaveLength(1)
            expect(review.items[0]?.evidence).toHaveLength(2)
            expect(review.items[0]?.decisions).toHaveLength(1)

            const receipts = await session.listReceipts()
            expect(receipts).toHaveLength(1)
            expect(receipts[0]?.patchPreviews).toHaveLength(1)

            const diagnostics = await session.getDiagnostics()
            expect(diagnostics.health.repositoryId).toBe('fixture')
            expect(diagnostics.auditEvents.map((event) => event.type)).toContain('import-markdown')
        } finally {
            await session.close()
        }
    })

    it('reports classification counts for the latest proposal only', async () => {
        const root = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-dashboard-latest-proposal-state-'))
        const app = await createLearningOpsApp(root)

        try {
            await app.store.putProposal({
                schemaVersion: 1,
                id: 'proposal_older',
                repositoryId: 'fixture',
                baselineId: 'baseline_older',
                version: 1,
                createdAt: '2026-08-02T00:00:00.000Z',
                guardrail: 'fixture',
                items: [
                    {
                        id: 'item_older',
                        clusterId: 'cluster_older',
                        classification: 'SKIP',
                        ruleText: 'maybe check this later',
                        targetId: 'skill-local-standards',
                        evidenceIds: [],
                        distinctEvidenceCount: 0,
                        rationale: 'old aggregate should not leak into the chart',
                        risks: [],
                        classifierVersion: 'test',
                    },
                ],
            })
            await app.store.putProposal({
                schemaVersion: 1,
                id: 'proposal_latest',
                repositoryId: 'fixture',
                baselineId: 'baseline_latest',
                version: 1,
                createdAt: '2026-08-03T00:00:00.000Z',
                guardrail: 'fixture',
                items: [
                    {
                        id: 'item_latest',
                        clusterId: 'cluster_latest',
                        classification: 'PROMOTE',
                        ruleText: 'Verify target hashes before patch preview.',
                        targetId: 'skill-local-standards',
                        evidenceIds: [],
                        distinctEvidenceCount: 2,
                        rationale: 'latest proposal should drive the chart',
                        risks: [],
                        classifierVersion: 'test',
                    },
                ],
            })
        } finally {
            await app.close()
        }

        const session = await createDashboardSession({ repositoryRoot: root })
        try {
            const overview = await session.getOverview()
            expect(overview.latestProposalId).toBe('proposal_latest')
            expect(overview.classificationCounts).toEqual({ PROMOTE: 1, NEEDS_VERIFICATION: 0, SKIP: 0 })
        } finally {
            await session.close()
            delete process.env.LEARNINGOPS_STATE_DIR
        }
    })
})
