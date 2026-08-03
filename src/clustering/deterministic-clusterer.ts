import { contentId, sha256Hex } from '../domain/ids.js'
import type { Evidence, LearningCluster } from '../domain/schemas.js'
import { normalizeLearningText } from './normalize.js'

export interface ClusterBuildResult {
    clusters: LearningCluster[]
}

export function buildDeterministicClusters(
    repositoryId: string,
    evidence: Evidence[],
    now = new Date().toISOString(),
): ClusterBuildResult {
    const grouped = new Map<string, Evidence[]>()

    for (const item of evidence) {
        const normalized = normalizeLearningText(item.rawFragment)
        const fingerprint = sha256Hex(normalized)
        const current = grouped.get(fingerprint) ?? []
        current.push(item)
        grouped.set(fingerprint, current)
    }

    const clusters = [...grouped.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([fingerprint, members]) => {
            const normalized = normalizeLearningText(members[0]?.rawFragment ?? '')
            return {
                schemaVersion: 1 as const,
                id: contentId('cluster', { repositoryId, fingerprint }),
                repositoryId,
                version: 1,
                fingerprint,
                representativeText: members[0]?.rawFragment.trim() ?? '',
                members: members
                    .map((member) => ({
                        evidenceId: member.id,
                        normalizedText: normalized,
                        score: 1,
                    }))
                    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
                explanation: 'Exact normalized fingerprint match.',
                needsReview: members.length === 1,
                createdAt: now,
            } satisfies LearningCluster
        })

    return { clusters }
}
