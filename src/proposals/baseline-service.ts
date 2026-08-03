import { contentId } from '../domain/ids.js'
import type { LearningCluster, PolicyTarget } from '../domain/schemas.js'

export function createBaselineId(input: {
    repositoryId: string
    clusters: LearningCluster[]
    targets: PolicyTarget[]
    classifierVersion: string
}): string {
    return contentId('baseline', {
        repositoryId: input.repositoryId,
        clusterIds: input.clusters.map((cluster) => cluster.id).sort(),
        targetIds: input.targets.map((target) => target.id).sort(),
        classifierVersion: input.classifierVersion,
    })
}
