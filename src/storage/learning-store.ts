import type {
    AuditEvent,
    Decision,
    Evidence,
    Learning,
    LearningCluster,
    PatchManifest,
    Proposal,
} from '../domain/schemas.js'

export type RecordKind = 'learning' | 'evidence' | 'cluster' | 'proposal' | 'decision' | 'patch' | 'event'

export interface LearningStore {
    initialize(): Promise<void>
    close(): Promise<void>
    putLearning(learning: Learning): Promise<void>
    putEvidence(evidence: Evidence): Promise<void>
    putCluster(cluster: LearningCluster): Promise<void>
    putProposal(proposal: Proposal): Promise<void>
    putDecision(decision: Decision): Promise<void>
    putPatch(patch: PatchManifest): Promise<void>
    appendEvent(event: AuditEvent): Promise<void>
    listLearnings(repositoryId: string): Promise<Learning[]>
    listEvidence(repositoryId: string): Promise<Evidence[]>
    listClusters(repositoryId: string): Promise<LearningCluster[]>
    listProposals(repositoryId: string): Promise<Proposal[]>
    listDecisions(repositoryId: string): Promise<Decision[]>
    listPatches(repositoryId: string): Promise<PatchManifest[]>
    listEvents(repositoryId: string): Promise<AuditEvent[]>
    getProposal(id: string): Promise<Proposal | undefined>
    getPatch(id: string): Promise<PatchManifest | undefined>
}
