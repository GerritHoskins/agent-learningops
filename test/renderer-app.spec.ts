// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { init as initChart } from 'echarts'
import type { LearningOpsRendererApi } from '../src/electron/ipc-contract.js'
import type { DashboardSnapshot } from '../src/index.js'
import App from '../src/renderer/app/App.svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('echarts', () => ({
    init: vi.fn(() => ({
        dispose: vi.fn(),
        resize: vi.fn(),
        setOption: vi.fn(),
    })),
}))

describe('renderer dashboard app', () => {
    let api: LearningOpsRendererApi

    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        const snapshot = createSnapshot()
        api = {
            selectRepository: vi.fn(async () => '/tmp/fixture'),
            openRepository: vi.fn(async () => snapshot),
            switchRepository: vi.fn(async () => snapshot),
            closeRepository: vi.fn(async () => undefined),
            getSnapshot: vi.fn(async () => snapshot),
            importMarkdown: vi.fn(async () => snapshot),
            clusterLearnings: vi.fn(async () => snapshot),
            proposeLearnings: vi.fn(async () => ({ proposal: snapshot.proposals[0]!, snapshot })),
            recordProposalDecision: vi.fn(async () => snapshot),
            previewPatch: vi.fn(async () => ({ patch: snapshot.patchPreviews[0]!, snapshot })),
            exportMarkdown: vi.fn(async () => ({ output: '/tmp/receipt.md', bytes: 128, snapshot })),
        }
        Object.defineProperty(window, 'learningOps', {
            configurable: true,
            value: api,
        })
    })

    it('opens a selected repository and filters the TanStack learning table', async () => {
        render(App)

        expect(screen.getByText('Open a local repository')).toBeInTheDocument()
        await fireEvent.click(screen.getByRole('button', { name: 'Browse' }))

        expect(api.selectRepository).toHaveBeenCalledTimes(1)
        await waitFor(() =>
            expect(api.openRepository).toHaveBeenCalledWith({
                repositoryRoot: '/tmp/fixture',
            }),
        )
        expect(await screen.findByText('Learning inbox')).toBeInTheDocument()
        await waitFor(() => expect(initChart).toHaveBeenCalled())
        expect(screen.getByText('local-plan')).toBeInTheDocument()

        await fireEvent.input(screen.getByLabelText('Filter table'), { target: { value: 'missing-skill' } })

        expect(screen.getByText('No learnings in scope')).toBeInTheDocument()
    })

    it('requires actor and rationale before recording proposal decisions', async () => {
        render(App)
        await fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
        await fireEvent.click(await screen.findByRole('button', { name: 'Proposals' }))

        await fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'team-standards' } })
        const approve = screen.getByRole('button', { name: 'Approve' })
        expect(approve).toBeDisabled()

        await fireEvent.input(screen.getByLabelText('Actor'), { target: { value: 'gerrit' } })
        await fireEvent.input(screen.getByLabelText('Rationale'), {
            target: { value: 'Evidence is current and target hash was reviewed.' },
        })
        expect(approve).toBeEnabled()

        await fireEvent.click(approve)

        await waitFor(() =>
            expect(api.recordProposalDecision).toHaveBeenCalledWith({
                proposalId: 'proposal_1',
                itemId: 'item_2',
                decision: 'approve',
                actor: 'gerrit',
                rationale: 'Evidence is current and target hash was reviewed.',
            }),
        )
    })

    it('previews patches for an approved selected target', async () => {
        render(App)
        await fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
        await fireEvent.click(await screen.findByRole('button', { name: 'Patches' }))

        await fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

        await waitFor(() =>
            expect(api.previewPatch).toHaveBeenCalledWith({
                proposalId: 'proposal_1',
                targetId: 'skill-local-standards',
            }),
        )
    })

    it('keeps patch preview disabled until the selected target has an approval', async () => {
        render(App)
        await fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
        await fireEvent.click(await screen.findByRole('button', { name: 'Patches' }))

        await fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'team-standards' } })

        expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled()
        expect(screen.getByText(/Approve at least one non-stale proposal item/)).toBeInTheDocument()
        expect(api.previewPatch).not.toHaveBeenCalled()
    })

    it('exports markdown through the main-owned destination flow', async () => {
        render(App)
        await fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
        await fireEvent.click(await screen.findByRole('button', { name: 'Receipts' }))
        await fireEvent.click(screen.getByRole('button', { name: 'Export' }))

        await waitFor(() =>
            expect(api.exportMarkdown).toHaveBeenCalledWith({
                proposalId: 'proposal_1',
                kind: 'proposal',
            }),
        )
        expect(api.exportMarkdown).not.toHaveBeenCalledWith(expect.objectContaining({ output: expect.any(String) }))
    })
})

function createSnapshot(): DashboardSnapshot {
    return {
        repository: {
            repositoryRoot: '/tmp/fixture',
            repositoryId: 'fixture',
            stateDirectory: '/tmp/state',
            targetCount: 2,
            targets: [
                {
                    id: 'skill-local-standards',
                    adapter: 'skill-reference',
                    path: '.agents/skills/local-promote-learnings/references/learned-standards.md',
                    validatorCount: 0,
                },
                {
                    id: 'team-standards',
                    adapter: 'skill-reference',
                    path: '.agents/skills/local-promote-learnings/references/team-standards.md',
                    validatorCount: 0,
                },
            ],
            capabilities: ['read', 'workflow', 'capture', 'decision'],
        },
        health: {
            repositoryId: 'fixture',
            node: 'v24.13.0',
            stateDirectory: '/tmp/state',
            targetCount: 2,
            capabilities: ['read', 'workflow', 'capture', 'decision'],
        },
        overview: {
            repository: {
                repositoryRoot: '/tmp/fixture',
                repositoryId: 'fixture',
                stateDirectory: '/tmp/state',
                targetCount: 2,
                targets: [
                    {
                        id: 'skill-local-standards',
                        adapter: 'skill-reference',
                        path: '.agents/skills/local-promote-learnings/references/learned-standards.md',
                        validatorCount: 0,
                    },
                    {
                        id: 'team-standards',
                        adapter: 'skill-reference',
                        path: '.agents/skills/local-promote-learnings/references/team-standards.md',
                        validatorCount: 0,
                    },
                ],
                capabilities: ['read', 'workflow', 'capture', 'decision'],
            },
            counts: {
                learnings: 1,
                evidence: 1,
                clusters: 1,
                proposals: 1,
                decisions: 1,
                patchPreviews: 1,
                auditEvents: 1,
            },
            classificationCounts: {
                PROMOTE: 1,
                NEEDS_VERIFICATION: 1,
                SKIP: 0,
            },
            latestProposalId: 'proposal_1',
            latestAuditEvent: {
                schemaVersion: 1,
                id: 'event_1',
                repositoryId: 'fixture',
                type: 'import-markdown',
                subjectId: 'learning_1',
                data: { imported: 1 },
                at: '2026-08-03T00:00:00.000Z',
            },
        },
        learnings: [
            {
                id: 'learning_1',
                sourcePath: '/tmp/fixture/.ms-artifacts/learnings/first.md',
                skill: 'local-plan',
                ticket: 'SAPP-1',
                date: '2026-08-01',
                candidateRules: ['Verify target hashes before patch preview.'],
                warnings: [],
                importedAt: '2026-08-03T00:00:00.000Z',
            },
        ],
        evidence: [
            {
                id: 'evidence_1',
                learningId: 'learning_1',
                sourcePath: '/tmp/fixture/.ms-artifacts/learnings/first.md',
                skill: 'local-plan',
                ticket: 'SAPP-1',
                date: '2026-08-01',
                rawFragment: 'Verify target hashes before patch preview.',
            },
        ],
        clusters: [
            {
                schemaVersion: 1,
                id: 'cluster_1',
                repositoryId: 'fixture',
                version: 1,
                fingerprint: 'fingerprint_1',
                representativeText: 'Verify target hashes before patch preview.',
                members: [{ evidenceId: 'evidence_1', normalizedText: 'verify target hashes', score: 1 }],
                explanation: 'Repeated evidence.',
                needsReview: false,
                createdAt: '2026-08-03T00:00:00.000Z',
            },
        ],
        proposals: [
            {
                schemaVersion: 1,
                id: 'proposal_1',
                repositoryId: 'fixture',
                baselineId: 'baseline_1',
                version: 1,
                guardrail: 'fixture',
                createdAt: '2026-08-03T00:00:00.000Z',
                items: [
                    {
                        id: 'item_1',
                        clusterId: 'cluster_1',
                        classification: 'PROMOTE',
                        ruleText: 'Verify target hashes before patch preview.',
                        targetId: 'skill-local-standards',
                        evidenceIds: ['evidence_1'],
                        distinctEvidenceCount: 1,
                        rationale: 'Repeated evidence.',
                        risks: [],
                        classifierVersion: 'test',
                    },
                    {
                        id: 'item_2',
                        clusterId: 'cluster_1',
                        classification: 'NEEDS_VERIFICATION',
                        ruleText: 'Verify uncertain evidence.',
                        targetId: 'team-standards',
                        evidenceIds: ['evidence_1'],
                        distinctEvidenceCount: 1,
                        rationale: 'Needs review.',
                        risks: ['Needs review.'],
                        classifierVersion: 'test',
                    },
                ],
            },
        ],
        decisions: [
            {
                schemaVersion: 1,
                id: 'decision_1',
                repositoryId: 'fixture',
                proposalId: 'proposal_1',
                proposalVersion: 1,
                itemId: 'item_1',
                decision: 'approve',
                actor: 'test',
                rationale: 'Approved in test.',
                decidedAt: '2026-08-03T00:00:00.000Z',
                stale: false,
            },
        ],
        patchPreviews: [
            {
                schemaVersion: 1,
                id: 'patch_1',
                repositoryId: 'fixture',
                proposalId: 'proposal_1',
                targetId: 'team-standards',
                targetPath: 'team-standards.md',
                beforeHash: 'before',
                afterHash: 'after',
                patchHash: 'patch',
                unifiedDiff: '+Verify target hashes before patch preview.',
                itemIds: ['item_1'],
                createdAt: '2026-08-03T00:00:00.000Z',
            },
        ],
        auditEvents: [
            {
                schemaVersion: 1,
                id: 'event_1',
                repositoryId: 'fixture',
                type: 'import-markdown',
                subjectId: 'learning_1',
                data: { imported: 1 },
                at: '2026-08-03T00:00:00.000Z',
            },
        ],
    }
}
