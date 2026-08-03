import { buildDeterministicClusters } from '../../src/clustering/deterministic-clusterer.js'
import { contentId, fileHash } from '../../src/domain/ids.js'
import type { Evidence } from '../../src/domain/schemas.js'

const startedAt = Date.now()
const evidence: Evidence[] = Array.from({ length: 960 }, (_, index) => {
    const text = `Verify target hashes before patch preview ${index % 24}`
    return {
        id: contentId('evidence', { index, text }),
        learningId: contentId('learning', { index }),
        repositoryId: 'benchmark',
        sourcePath: `.ms-artifacts/learnings/${index}.md`,
        sourceHash: fileHash(text),
        canonicalLineageId: contentId('lineage', { index }),
        rawFragment: text,
    }
})
const result = buildDeterministicClusters('benchmark', evidence)
const durationMs = Date.now() - startedAt

if (durationMs > 30_000) {
    throw new Error(`Benchmark exceeded 30s: ${durationMs}ms`)
}

process.stdout.write(
    `${JSON.stringify({ evidenceCount: evidence.length, clusterCount: result.clusters.length, durationMs })}\n`,
)
