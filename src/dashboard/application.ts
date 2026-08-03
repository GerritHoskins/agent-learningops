import {
    createDashboardSession,
    dashboardDecisionInputSchema,
    dashboardExportMarkdownInputSchema,
    dashboardPatchPreviewInputSchema,
    dashboardRepositoryInputSchema,
    parseDashboardImportInput,
    type DashboardRepositoryInput,
    type DashboardSession,
    type DashboardSnapshot,
} from './session.js'
import type { DecisionKind, PatchManifest, Proposal } from '../domain/schemas.js'

export interface LearningOpsDesktopApplication {
    openRepository(input: DashboardRepositoryInput): Promise<DashboardSnapshot>
    switchRepository(input: DashboardRepositoryInput): Promise<DashboardSnapshot>
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
    exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }): Promise<{
        output: string
        bytes: number
        snapshot: DashboardSnapshot
    }>
}

export function createLearningOpsDesktopApplication(): LearningOpsDesktopApplication {
    return new LearningOpsDesktopApplicationController()
}

class LearningOpsDesktopApplicationController implements LearningOpsDesktopApplication {
    private session: DashboardSession | undefined

    async openRepository(input: DashboardRepositoryInput): Promise<DashboardSnapshot> {
        if (this.session) {
            throw new Error('A repository is already open. Use switchRepository to replace it.')
        }

        this.session = await createDashboardSession(dashboardRepositoryInputSchema.parse(input))
        return this.session.getSnapshot()
    }

    async switchRepository(input: DashboardRepositoryInput): Promise<DashboardSnapshot> {
        const nextSession = await createDashboardSession(dashboardRepositoryInputSchema.parse(input))
        const previousSession = this.session
        try {
            await previousSession?.close()
        } catch (error) {
            await nextSession.close()
            throw error
        }

        this.session = nextSession
        return nextSession.getSnapshot()
    }

    async closeRepository(): Promise<void> {
        await this.session?.close()
        this.session = undefined
    }

    async getSnapshot(): Promise<DashboardSnapshot> {
        return this.requireSession().getSnapshot()
    }

    async importMarkdown(input: { since?: string; skill?: string } = {}): Promise<DashboardSnapshot> {
        await this.requireSession().importMarkdown(parseDashboardImportInput(input))
        return this.getSnapshot()
    }

    async clusterLearnings(): Promise<DashboardSnapshot> {
        await this.requireSession().clusterLearnings()
        return this.getSnapshot()
    }

    async proposeLearnings(): Promise<{ proposal: Proposal; snapshot: DashboardSnapshot }> {
        const proposal = await this.requireSession().proposeLearnings()
        return { proposal, snapshot: await this.getSnapshot() }
    }

    async recordProposalDecision(input: {
        proposalId: string
        itemId: string
        decision: DecisionKind
        actor: string
        rationale: string
    }): Promise<DashboardSnapshot> {
        await this.requireSession().recordProposalDecision(dashboardDecisionInputSchema.parse(input))
        return this.getSnapshot()
    }

    async previewPatch(input: { proposalId: string; targetId: string }): Promise<{ patch: PatchManifest; snapshot: DashboardSnapshot }> {
        const patch = await this.requireSession().previewPatch(dashboardPatchPreviewInputSchema.parse(input))
        return { patch, snapshot: await this.getSnapshot() }
    }

    async exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }) {
        const result = await this.requireSession().exportMarkdown(dashboardExportMarkdownInputSchema.parse(input))
        return { ...result, snapshot: await this.getSnapshot() }
    }

    private requireSession(): DashboardSession {
        if (!this.session) {
            throw new Error('No repository is open. Select a repository first.')
        }

        return this.session
    }
}
