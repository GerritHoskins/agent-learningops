import type { DashboardSnapshot } from '../dashboard/session.js'
import type { DecisionKind, PatchManifest, Proposal } from '../domain/schemas.js'

export const learningOpsIpcChannels = {
    selectRepository: 'learningops:repository:select',
    openRepository: 'learningops:repository:open',
    switchRepository: 'learningops:repository:switch',
    closeRepository: 'learningops:repository:close',
    getSnapshot: 'learningops:snapshot:get',
    importMarkdown: 'learningops:workflow:import-markdown',
    clusterLearnings: 'learningops:workflow:cluster',
    proposeLearnings: 'learningops:workflow:propose',
    recordProposalDecision: 'learningops:workflow:decision-record',
    previewPatch: 'learningops:workflow:patch-preview',
    exportMarkdown: 'learningops:workflow:export-markdown',
} as const

export type LearningOpsIpcChannel = (typeof learningOpsIpcChannels)[keyof typeof learningOpsIpcChannels]

export interface LearningOpsRendererApi {
    selectRepository(): Promise<string | undefined>
    openRepository(input: { repositoryRoot: string }): Promise<DashboardSnapshot>
    switchRepository(input: { repositoryRoot: string }): Promise<DashboardSnapshot>
    closeRepository(): Promise<void>
    getSnapshot(): Promise<DashboardSnapshot>
    importMarkdown(input?: { since?: string; skill?: string }): Promise<DashboardSnapshot>
    clusterLearnings(): Promise<DashboardSnapshot>
    proposeLearnings(): Promise<{ proposal: Proposal; snapshot: DashboardSnapshot }>
    recordProposalDecision(input: {
        proposalId: string
        itemId: string
        decision: DecisionKind
        actor: string
        rationale: string
    }): Promise<DashboardSnapshot>
    previewPatch(input: { proposalId: string; targetId: string }): Promise<{ patch: PatchManifest; snapshot: DashboardSnapshot }>
    exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt' }): Promise<{
        output: string
        bytes: number
        snapshot: DashboardSnapshot
    } | undefined>
}

declare global {
    interface Window {
        learningOps: LearningOpsRendererApi
    }
}
