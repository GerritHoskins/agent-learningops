import { classifierVersion, classifyRule } from '../domain/classification.js'
import { contentId } from '../domain/ids.js'
import type { Evidence, LearningCluster, PolicyTarget, Proposal, ProposalItem } from '../domain/schemas.js'
import { createBaselineId } from './baseline-service.js'

export function buildProposal(input: {
    repositoryId: string
    clusters: LearningCluster[]
    evidence: Evidence[]
    targets: PolicyTarget[]
    now?: string
}): Proposal {
    const now = input.now ?? new Date().toISOString()
    const evidenceById = new Map(input.evidence.map((item) => [item.id, item]))
    const targets = input.targets.length > 0 ? input.targets : [undefined]
    const baselineId = createBaselineId({
        repositoryId: input.repositoryId,
        clusters: input.clusters,
        targets: input.targets,
        classifierVersion,
    })

    const items: ProposalItem[] = input.clusters.flatMap((cluster) => {
        const clusterEvidence = cluster.members
            .map((member) => evidenceById.get(member.evidenceId))
            .filter((item): item is Evidence => Boolean(item))
        const distinctEvidenceCount = new Set(clusterEvidence.map((item) => item.canonicalLineageId)).size
        const skillCount = new Set(clusterEvidence.map((item) => item.skill).filter(Boolean)).size
        const candidateRule = cluster.representativeText.trim()
        const classification = classifyRule({
            distinctEvidenceCount,
            skillCount,
            ruleText: candidateRule,
            warnings: cluster.needsReview ? ['single_occurrence_cluster'] : [],
        })

        return targets.map((target) => ({
            id: contentId('item', {
                baselineId,
                clusterId: cluster.id,
                candidateRule,
                targetId: target?.id,
                classification: classification.classification,
            }),
            clusterId: cluster.id,
            classification: classification.classification,
            ruleText: candidateRule,
            ...(target ? { targetId: target.id } : {}),
            evidenceIds: clusterEvidence.map((item) => item.id).sort(),
            distinctEvidenceCount,
            rationale: classification.rationale,
            risks: classification.risks,
            classifierVersion,
        }))
    })

    return {
        schemaVersion: 1,
        id: contentId('proposal', {
            repositoryId: input.repositoryId,
            baselineId,
            items: items.map((item) => item.id).sort(),
        }),
        repositoryId: input.repositoryId,
        version: 1,
        baselineId,
        createdAt: now,
        items,
        guardrail: 'Proposal only. No policy target was mutated and no approval is inferred from classification.',
    }
}
