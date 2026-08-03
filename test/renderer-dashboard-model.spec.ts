import {
    createClassificationChartOption,
    createDashboardTables,
    createMetricCards,
    getTableHeaders,
} from '../src/renderer/app/dashboard-model.js'
import type { DashboardSnapshot } from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('renderer dashboard model', () => {
    it('derives metric cards, TanStack tables, and ECharts options from a dashboard snapshot', () => {
        const snapshot = createSnapshot()

        expect(createMetricCards(snapshot)).toEqual([
            { label: 'Learnings', value: '1', detail: '1 evidence fragments' },
            { label: 'Clusters', value: '1', detail: '1 proposal runs' },
            { label: 'Decisions', value: '1', detail: '1 patch previews' },
            { label: 'Targets', value: '1', detail: 'fixture' },
        ])

        const tables = createDashboardTables(snapshot)
        expect(getTableHeaders(tables.learningTable)).toEqual(['Skill', 'Ticket', 'Source', 'Warnings'])
        expect(tables.learningTable.getRowModel().rows).toHaveLength(1)
        expect(tables.proposalRows[0]).toMatchObject({
            id: 'proposal_1',
            promote: 1,
            needsVerification: 1,
            skip: 0,
        })
        expect(getTableHeaders(tables.auditTable)).toEqual(['When', 'Event', 'Summary'])

        const chartOption = createClassificationChartOption(snapshot)
        expect(chartOption.series).toEqual([
            expect.objectContaining({
                name: 'Classification',
                type: 'pie',
                data: [
                    { name: 'Promote', value: 1 },
                    { name: 'Needs verification', value: 1 },
                    { name: 'Skip', value: 0 },
                ],
            }),
        ])
    })

    it('applies inbox skill and since filters to visible learning rows only', () => {
        const snapshot = createSnapshot()
        snapshot.learnings.push({
            id: 'learning_2',
            sourcePath: '/tmp/fixture/.ms-artifacts/learnings/second.md',
            skill: 'local-review',
            ticket: 'SAPP-2',
            date: '2026-07-30',
            candidateRules: ['Prefer targeted regression tests.'],
            warnings: [],
            importedAt: '2026-08-03T00:00:00.000Z',
        })

        expect(createDashboardTables(snapshot).learningRows.map((row) => row.id)).toEqual(['learning_1', 'learning_2'])
        expect(
            createDashboardTables(snapshot, {
                learningSkillFilter: 'plan',
                learningSinceFilter: '2026-08-01',
            }).learningRows.map((row) => row.id),
        ).toEqual(['learning_1'])
        expect(
            createDashboardTables(snapshot, {
                learningSkillFilter: 'review',
                learningSinceFilter: '2026-08-01',
            }).learningRows,
        ).toEqual([])
    })
})

function createSnapshot(): DashboardSnapshot {
    return {
        repository: {
            repositoryRoot: '/tmp/fixture',
            repositoryId: 'fixture',
            stateDirectory: '/tmp/state',
            targetCount: 1,
            targets: [
                {
                    id: 'skill-local-standards',
                    adapter: 'skill-reference',
                    path: '.agents/skills/local-promote-learnings/references/learned-standards.md',
                    validatorCount: 0,
                },
            ],
            capabilities: ['read', 'workflow', 'capture', 'decision'],
        },
        health: {
            repositoryId: 'fixture',
            node: 'v24.13.0',
            stateDirectory: '/tmp/state',
            targetCount: 1,
            capabilities: ['read', 'workflow', 'capture', 'decision'],
        },
        overview: {
            repository: {
                repositoryRoot: '/tmp/fixture',
                repositoryId: 'fixture',
                stateDirectory: '/tmp/state',
                targetCount: 1,
                targets: [
                    {
                        id: 'skill-local-standards',
                        adapter: 'skill-reference',
                        path: '.agents/skills/local-promote-learnings/references/learned-standards.md',
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
                        targetId: 'skill-local-standards',
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
                targetId: 'skill-local-standards',
                targetPath: 'learned-standards.md',
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
