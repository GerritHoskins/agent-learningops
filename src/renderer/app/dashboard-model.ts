import type { DashboardSnapshot } from '../../dashboard/session.js'
import type { AuditEvent, ProposalItem } from '../../domain/schemas.js'
import {
    createTable,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
    type Table,
} from '@tanstack/table-core'
import type { EChartsOption } from 'echarts'

export type DashboardView =
    | 'setup'
    | 'inbox'
    | 'clusters'
    | 'proposals'
    | 'decisions'
    | 'patches'
    | 'receipts'
    | 'diagnostics'

export interface MetricCard {
    label: string
    value: string
    detail: string
}

export interface LearningRow {
    id: string
    skill: string
    ticket: string
    source: string
    warnings: number
}

export interface ProposalRow {
    id: string
    createdAt: string
    items: number
    promote: number
    needsVerification: number
    skip: number
}

export interface AuditRow {
    at: string
    type: string
    summary: string
}

export interface DashboardTableState {
    learningFilter?: string
    learningSkillFilter?: string
    learningSinceFilter?: string
    learningSorting?: SortingState
    proposalSorting?: SortingState
    auditSorting?: SortingState
}

export interface DashboardTables {
    learningTable: Table<LearningRow>
    proposalTable: Table<ProposalRow>
    auditTable: Table<AuditRow>
    learningRows: LearningRow[]
    proposalRows: ProposalRow[]
    auditRows: AuditRow[]
}

const learningColumns: Array<ColumnDef<LearningRow>> = [
    { accessorKey: 'skill', header: 'Skill' },
    { accessorKey: 'ticket', header: 'Ticket' },
    { accessorKey: 'source', header: 'Source' },
    { accessorKey: 'warnings', header: 'Warnings' },
]

const proposalColumns: Array<ColumnDef<ProposalRow>> = [
    { accessorKey: 'id', header: 'Proposal' },
    { accessorKey: 'items', header: 'Items' },
    { accessorKey: 'promote', header: 'Promote' },
    { accessorKey: 'needsVerification', header: 'Verify' },
    { accessorKey: 'skip', header: 'Skip' },
]

const auditColumns: Array<ColumnDef<AuditRow>> = [
    { accessorKey: 'at', header: 'When' },
    { accessorKey: 'type', header: 'Event' },
    { accessorKey: 'summary', header: 'Summary' },
]

export function createMetricCards(snapshot: DashboardSnapshot): MetricCard[] {
    return [
        {
            label: 'Learnings',
            value: String(snapshot.overview.counts.learnings),
            detail: `${snapshot.overview.counts.evidence} evidence fragments`,
        },
        {
            label: 'Clusters',
            value: String(snapshot.overview.counts.clusters),
            detail: `${snapshot.proposals.length} proposal runs`,
        },
        {
            label: 'Decisions',
            value: String(snapshot.overview.counts.decisions),
            detail: `${snapshot.overview.counts.patchPreviews} patch previews`,
        },
        {
            label: 'Targets',
            value: String(snapshot.repository.targetCount),
            detail: snapshot.repository.repositoryId,
        },
    ]
}

export function createDashboardTables(snapshot: DashboardSnapshot, state: DashboardTableState = {}): DashboardTables {
    const learningRows = snapshot.learnings
        .filter((learning) => matchesLearningScope(learning, state))
        .map((learning) => ({
            id: learning.id,
            skill: learning.skill ?? 'unclassified',
            ticket: learning.ticket ?? '-',
            source: formatFileName(learning.sourcePath),
            warnings: learning.warnings.length,
        }))
    const proposalRows = snapshot.proposals.map((proposal) => {
        const counts = countProposalClassifications(proposal.items)
        return {
            id: proposal.id,
            createdAt: proposal.createdAt,
            items: proposal.items.length,
            promote: counts.PROMOTE,
            needsVerification: counts.NEEDS_VERIFICATION,
            skip: counts.SKIP,
        }
    })
    const auditRows = snapshot.auditEvents.map((event) => ({
        at: event.at,
        type: event.type,
        summary: summarizeAuditEvent(event),
    }))

    const learningTable = createDataTable(learningRows, learningColumns, {
        globalFilter: state.learningFilter ?? '',
        sorting: state.learningSorting ?? [],
    })
    const proposalTable = createDataTable(proposalRows, proposalColumns, {
        sorting: state.proposalSorting ?? [{ id: 'id', desc: true }],
    })
    const auditTable = createDataTable(auditRows, auditColumns, {
        sorting: state.auditSorting ?? [{ id: 'at', desc: true }],
    })

    return {
        learningRows: getTableRows(learningTable),
        proposalRows: getTableRows(proposalTable),
        auditRows: getTableRows(auditTable),
        learningTable,
        proposalTable,
        auditTable,
    }
}

export function createClassificationChartOption(snapshot: DashboardSnapshot): EChartsOption {
    const counts = snapshot.overview.classificationCounts
    const data = [
        { name: 'Promote', value: counts.PROMOTE },
        { name: 'Needs verification', value: counts.NEEDS_VERIFICATION },
        { name: 'Skip', value: counts.SKIP },
    ]

    return {
        color: ['#1f9d77', '#d39b24', '#596579'],
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, left: 'center' },
        series: [
            {
                name: 'Classification',
                type: 'pie',
                radius: ['45%', '70%'],
                avoidLabelOverlap: true,
                data,
            },
        ],
    }
}

export function formatFileName(path: string): string {
    return path.split('/').filter(Boolean).at(-1) ?? path
}

export function getTableHeaders<T>(table: Table<T>): string[] {
    return table.getAllLeafColumns().map((column) => String(column.columnDef.header ?? column.id))
}

function createDataTable<T>(
    data: T[],
    columns: Array<ColumnDef<T>>,
    state: { globalFilter?: string; sorting?: SortingState } = {},
): Table<T> {
    return createTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        globalFilterFn: 'includesString',
        onStateChange: () => undefined,
        renderFallbackValue: null,
        state,
    })
}

function getTableRows<T>(table: Table<T>): T[] {
    return table.getRowModel().rows.map((row) => row.original)
}

function matchesLearningScope(learning: DashboardSnapshot['learnings'][number], state: DashboardTableState): boolean {
    const skillFilter = state.learningSkillFilter?.trim().toLowerCase()
    const sinceFilter = state.learningSinceFilter?.trim()
    const matchesSkill = !skillFilter || (learning.skill ?? '').toLowerCase().includes(skillFilter)
    const matchesSince = !sinceFilter || Boolean(learning.date && learning.date >= sinceFilter)

    return matchesSkill && matchesSince
}

function countProposalClassifications(items: ProposalItem[]): Record<ProposalItem['classification'], number> {
    const counts: Record<ProposalItem['classification'], number> = { PROMOTE: 0, NEEDS_VERIFICATION: 0, SKIP: 0 }

    for (const item of items) {
        counts[item.classification] += 1
    }

    return counts
}

function summarizeAuditEvent(event: AuditEvent): string {
    const payload = Object.entries(event.data)
        .slice(0, 2)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ')
    return payload || event.id
}
