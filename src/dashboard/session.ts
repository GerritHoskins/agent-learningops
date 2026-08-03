import {
    clusterLearnings,
    createLearningOpsApp,
    doctor,
    exportMarkdown,
    importMarkdown,
    previewPatch,
    proposeLearnings,
    recordProposalDecision,
    type LearningOpsApp,
} from '../app.js'
import { resolveStateDirectory } from '../config/state-dir.js'
import type {
    AuditEvent,
    Decision,
    DecisionKind,
    Evidence,
    Learning,
    LearningCluster,
    PatchManifest,
    PolicyTarget,
    Proposal,
    ProposalItem,
} from '../domain/schemas.js'
import { decisionKindSchema } from '../domain/schemas.js'
import { z } from 'zod'

export const dashboardRepositoryInputSchema = z.object({
    repositoryRoot: z.string().trim().min(1, 'A repositoryRoot must be selected explicitly.'),
}).strict()

export const dashboardImportInputSchema = z
    .object({
        since: z.string().trim().min(1).optional(),
        skill: z.string().trim().min(1).optional(),
    })
    .strict()
    .default({})

export type DashboardImportInput = { since?: string; skill?: string }

export const dashboardDecisionInputSchema = z.object({
    proposalId: z.string().trim().min(1),
    itemId: z.string().trim().min(1),
    decision: decisionKindSchema,
    actor: z.string().trim().min(1, 'Decision actor is required.'),
    rationale: z.string().trim().min(1, 'Decision rationale is required.'),
}).strict()

export const dashboardPatchPreviewInputSchema = z.object({
    proposalId: z.string().trim().min(1),
    targetId: z.string().trim().min(1),
}).strict()

export const dashboardExportMarkdownInputSchema = z.object({
    proposalId: z.string().trim().min(1),
    kind: z.enum(['proposal', 'receipt']),
    output: z.string().trim().min(1),
}).strict()

export interface DashboardRepositoryInput {
    repositoryRoot: string
}

export interface DashboardRepositorySummary {
    repositoryRoot: string
    repositoryId: string
    stateDirectory: string
    targetCount: number
    targets: DashboardTargetSummary[]
    capabilities: Array<'read' | 'workflow' | 'capture' | 'decision'>
}

export interface DashboardTargetSummary {
    id: string
    adapter: PolicyTarget['adapter']
    path: string
    validatorCount: number
}

export interface DashboardOverview {
    repository: DashboardRepositorySummary
    counts: {
        learnings: number
        evidence: number
        clusters: number
        proposals: number
        decisions: number
        patchPreviews: number
        auditEvents: number
    }
    classificationCounts: Record<ProposalItem['classification'], number>
    latestProposalId?: string
    latestAuditEvent?: AuditEvent
}

export interface DashboardLearningInbox {
    learnings: Array<
        Pick<Learning, 'id' | 'sourcePath' | 'skill' | 'ticket' | 'date' | 'candidateRules' | 'warnings' | 'importedAt'>
    >
    evidence: Array<Pick<Evidence, 'id' | 'learningId' | 'sourcePath' | 'skill' | 'ticket' | 'date' | 'rawFragment'>>
}

export interface DashboardProposalReview {
    proposal?: Proposal
    items: DashboardProposalItem[]
    decisions: Decision[]
    patchPreviews: PatchManifest[]
}

export interface DashboardProposalItem {
    item: ProposalItem
    evidence: Evidence[]
    decisions: Decision[]
}

export interface DashboardReceipt {
    decision: Decision
    proposal?: Proposal
    patchPreviews: PatchManifest[]
}

export interface DashboardDiagnostics {
    repository: DashboardRepositorySummary
    health: Awaited<ReturnType<typeof doctor>>
    auditEvents: AuditEvent[]
}

export interface DashboardSnapshot {
    repository: DashboardRepositorySummary
    health: Awaited<ReturnType<typeof doctor>>
    overview: DashboardOverview
    learnings: DashboardLearningInbox['learnings']
    evidence: DashboardLearningInbox['evidence']
    clusters: LearningCluster[]
    proposals: Proposal[]
    decisions: Decision[]
    patchPreviews: PatchManifest[]
    auditEvents: AuditEvent[]
}

export interface DashboardSession {
    readonly repository: DashboardRepositorySummary
    close(): Promise<void>
    importMarkdown(options?: DashboardImportInput): Promise<Awaited<ReturnType<typeof importMarkdown>>>
    clusterLearnings(): Promise<Awaited<ReturnType<typeof clusterLearnings>>>
    proposeLearnings(): Promise<Proposal>
    recordProposalDecision(input: {
        proposalId: string
        itemId: string
        decision: DecisionKind
        actor: string
        rationale: string
    }): Promise<Decision>
    previewPatch(input: { proposalId: string; targetId: string }): Promise<PatchManifest>
    exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }): Promise<{
        output: string
        bytes: number
    }>
    getOverview(): Promise<DashboardOverview>
    getLearningInbox(): Promise<DashboardLearningInbox>
    listClusters(): Promise<LearningCluster[]>
    listProposals(): Promise<Proposal[]>
    getProposalReview(proposalId?: string): Promise<DashboardProposalReview>
    listPatchPreviews(): Promise<PatchManifest[]>
    listReceipts(): Promise<DashboardReceipt[]>
    listAuditEvents(): Promise<AuditEvent[]>
    getSnapshot(): Promise<DashboardSnapshot>
    getDiagnostics(): Promise<DashboardDiagnostics>
}

export async function validateRepositorySelection(
    input: DashboardRepositoryInput,
): Promise<{ ok: true; repository: DashboardRepositorySummary } | { ok: false; error: string }> {
    let session: DashboardSession | undefined
    try {
        session = await createDashboardSession(input)
        return { ok: true, repository: session.repository }
    } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
        await session?.close()
    }
}

export async function createDashboardSession(input: DashboardRepositoryInput): Promise<DashboardSession> {
    const selectedRoot = requireExplicitRepositoryRoot(input)
    const app = await createLearningOpsApp(selectedRoot)
    return new LearningOpsDashboardSession(app)
}

function requireExplicitRepositoryRoot(input: DashboardRepositoryInput): string {
    return dashboardRepositoryInputSchema.parse(input).repositoryRoot
}

class LearningOpsDashboardSession implements DashboardSession {
    readonly repository: DashboardRepositorySummary

    constructor(private readonly app: LearningOpsApp) {
        this.repository = summarizeRepository(app)
    }

    async close(): Promise<void> {
        await this.app.close()
    }

    async importMarkdown(options: DashboardImportInput = {}) {
        return importMarkdown(this.app, parseDashboardImportInput(options))
    }

    async clusterLearnings() {
        return clusterLearnings(this.app)
    }

    async proposeLearnings(): Promise<Proposal> {
        return proposeLearnings(this.app)
    }

    async recordProposalDecision(input: {
        proposalId: string
        itemId: string
        decision: DecisionKind
        actor: string
        rationale: string
    }): Promise<Decision> {
        return recordProposalDecision(this.app, dashboardDecisionInputSchema.parse(input))
    }

    async previewPatch(input: { proposalId: string; targetId: string }): Promise<PatchManifest> {
        return previewPatch(this.app, dashboardPatchPreviewInputSchema.parse(input))
    }

    async exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }) {
        return exportMarkdown(this.app, dashboardExportMarkdownInputSchema.parse(input))
    }

    async getOverview(): Promise<DashboardOverview> {
        const [learnings, evidence, clusters, proposals, decisions, patches, auditEvents] = await Promise.all([
            this.app.store.listLearnings(this.app.config.repositoryId),
            this.app.store.listEvidence(this.app.config.repositoryId),
            this.app.store.listClusters(this.app.config.repositoryId),
            this.app.store.listProposals(this.app.config.repositoryId),
            this.app.store.listDecisions(this.app.config.repositoryId),
            this.app.store.listPatches(this.app.config.repositoryId),
            this.listAuditEvents(),
        ])
        const orderedProposals = orderProposals(proposals)
        const orderedEvents = orderAuditEvents(auditEvents)

        return {
            repository: this.repository,
            counts: {
                learnings: learnings.length,
                evidence: evidence.length,
                clusters: clusters.length,
                proposals: proposals.length,
                decisions: decisions.length,
                patchPreviews: patches.length,
                auditEvents: auditEvents.length,
            },
            classificationCounts: countClassifications(proposals),
            ...(orderedProposals[0] ? { latestProposalId: orderedProposals[0].id } : {}),
            ...(orderedEvents[0] ? { latestAuditEvent: orderedEvents[0] } : {}),
        }
    }

    async getLearningInbox(): Promise<DashboardLearningInbox> {
        const [learnings, evidence] = await Promise.all([
            this.app.store.listLearnings(this.app.config.repositoryId),
            this.app.store.listEvidence(this.app.config.repositoryId),
        ])

        return {
            learnings: learnings.map((learning) => ({
                id: learning.id,
                sourcePath: learning.sourcePath,
                ...(learning.skill ? { skill: learning.skill } : {}),
                ...(learning.ticket ? { ticket: learning.ticket } : {}),
                ...(learning.date ? { date: learning.date } : {}),
                candidateRules: learning.candidateRules,
                warnings: learning.warnings,
                importedAt: learning.importedAt,
            })),
            evidence: evidence.map((item) => ({
                id: item.id,
                learningId: item.learningId,
                sourcePath: item.sourcePath,
                ...(item.skill ? { skill: item.skill } : {}),
                ...(item.ticket ? { ticket: item.ticket } : {}),
                ...(item.date ? { date: item.date } : {}),
                rawFragment: item.rawFragment,
            })),
        }
    }

    async listClusters(): Promise<LearningCluster[]> {
        return this.app.store.listClusters(this.app.config.repositoryId)
    }

    async listProposals(): Promise<Proposal[]> {
        return orderProposals(await this.app.store.listProposals(this.app.config.repositoryId))
    }

    async getProposalReview(proposalId?: string): Promise<DashboardProposalReview> {
        const [proposals, evidence, decisions, patches] = await Promise.all([
            this.listProposals(),
            this.app.store.listEvidence(this.app.config.repositoryId),
            this.app.store.listDecisions(this.app.config.repositoryId),
            this.app.store.listPatches(this.app.config.repositoryId),
        ])
        const proposal = proposalId ? proposals.find((candidate) => candidate.id === proposalId) : proposals[0]
        if (!proposal) {
            return { items: [], decisions: [], patchPreviews: [] }
        }

        const evidenceById = new Map(evidence.map((item) => [item.id, item]))
        const relatedDecisions = decisions.filter((decision) => decision.proposalId === proposal.id)
        const relatedPatches = patches.filter((patch) => patch.proposalId === proposal.id)

        return {
            proposal,
            items: proposal.items.map((item) => ({
                item,
                evidence: item.evidenceIds
                    .map((evidenceId) => evidenceById.get(evidenceId))
                    .filter((candidate): candidate is Evidence => Boolean(candidate)),
                decisions: relatedDecisions.filter((decision) => decision.itemId === item.id),
            })),
            decisions: relatedDecisions,
            patchPreviews: relatedPatches,
        }
    }

    async listPatchPreviews(): Promise<PatchManifest[]> {
        return this.app.store.listPatches(this.app.config.repositoryId)
    }

    async listReceipts(): Promise<DashboardReceipt[]> {
        const [decisions, proposals, patches] = await Promise.all([
            this.app.store.listDecisions(this.app.config.repositoryId),
            this.listProposals(),
            this.app.store.listPatches(this.app.config.repositoryId),
        ])
        const proposalsById = new Map(proposals.map((proposal) => [proposal.id, proposal]))

        return decisions.map((decision) => {
            const proposal = proposalsById.get(decision.proposalId)
            return {
                decision,
                ...(proposal ? { proposal } : {}),
                patchPreviews: patches.filter((patch) => patch.proposalId === decision.proposalId),
            }
        })
    }

    async listAuditEvents(): Promise<AuditEvent[]> {
        return orderAuditEvents(await this.app.store.listEvents(this.app.config.repositoryId))
    }

    async getDiagnostics(): Promise<DashboardDiagnostics> {
        return {
            repository: this.repository,
            health: await doctor(this.app),
            auditEvents: await this.listAuditEvents(),
        }
    }

    async getSnapshot(): Promise<DashboardSnapshot> {
        const [health, overview, inbox, clusters, proposals, decisions, patches, auditEvents] = await Promise.all([
            doctor(this.app),
            this.getOverview(),
            this.getLearningInbox(),
            this.listClusters(),
            this.listProposals(),
            this.app.store.listDecisions(this.app.config.repositoryId),
            this.listPatchPreviews(),
            this.listAuditEvents(),
        ])

        return {
            repository: this.repository,
            health,
            overview,
            learnings: inbox.learnings,
            evidence: inbox.evidence,
            clusters,
            proposals,
            decisions,
            patchPreviews: patches,
            auditEvents,
        }
    }
}

function summarizeRepository(app: LearningOpsApp): DashboardRepositorySummary {
    return {
        repositoryRoot: app.repositoryRoot,
        repositoryId: app.config.repositoryId,
        stateDirectory: resolveStateDirectory(app.repositoryRoot, app.config),
        targetCount: app.config.targets.length,
        targets: app.config.targets.map((target) => ({
            id: target.id,
            adapter: target.adapter,
            path: target.path,
            validatorCount: target.validators.length,
        })),
        capabilities: ['read', 'workflow', 'capture', 'decision'],
    }
}

function countClassifications(proposals: Proposal[]): Record<ProposalItem['classification'], number> {
    return proposals
        .flatMap((proposal) => proposal.items)
        .reduce<Record<ProposalItem['classification'], number>>(
            (counts, item) => ({
                ...counts,
                [item.classification]: counts[item.classification] + 1,
            }),
            { PROMOTE: 0, NEEDS_VERIFICATION: 0, SKIP: 0 },
        )
}

function orderProposals(proposals: Proposal[]): Proposal[] {
    return [...proposals].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

function orderAuditEvents(events: AuditEvent[]): AuditEvent[] {
    return [...events].sort((left, right) => right.at.localeCompare(left.at))
}

export function parseDashboardImportInput(input: unknown = {}): DashboardImportInput {
    const parsed = dashboardImportInputSchema.parse(input)
    return {
        ...(parsed.since ? { since: parsed.since } : {}),
        ...(parsed.skill ? { skill: parsed.skill } : {}),
    }
}
