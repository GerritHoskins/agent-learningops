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
    const prepared = evidence
        .map((item) => ({
            item,
            normalized: normalizeLearningText(item.rawFragment),
            tokens: tokenizeLearningText(item.rawFragment),
        }))
        .filter((item) => item.normalized.length > 0)
        .sort((left, right) => left.item.id.localeCompare(right.item.id))
    const union = new UnionFind(prepared.length)

    for (let leftIndex = 0; leftIndex < prepared.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < prepared.length; rightIndex += 1) {
            if (shouldCluster(prepared[leftIndex]!, prepared[rightIndex]!)) {
                union.join(leftIndex, rightIndex)
            }
        }
    }

    const grouped = new Map<number, typeof prepared>()
    for (const [index, item] of prepared.entries()) {
        const root = union.find(index)
        grouped.set(root, [...(grouped.get(root) ?? []), item])
    }

    const clusters = [...grouped.values()]
        .map((members) => members.sort((left, right) => left.item.id.localeCompare(right.item.id)))
        .sort((left, right) => clusterFingerprint(left).localeCompare(clusterFingerprint(right)))
        .map((members) => {
            const representative = chooseRepresentative(members)
            const fingerprint = clusterFingerprint(members)
            const exactMatch = members.every((member) => member.normalized === representative.normalized)
            return {
                schemaVersion: 1 as const,
                id: contentId('cluster', { repositoryId, fingerprint }),
                repositoryId,
                version: 1,
                fingerprint,
                representativeText: representative.item.rawFragment.trim(),
                members: members
                    .map((member) => ({
                        evidenceId: member.item.id,
                        normalizedText: member.normalized,
                        score: similarityScore(representative, member),
                    }))
                    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
                explanation: exactMatch
                    ? 'Exact normalized fingerprint match.'
                    : 'Conservative token similarity grouped related learning fragments for reviewer confirmation.',
                needsReview: members.length === 1 || !exactMatch,
                createdAt: now,
            } satisfies LearningCluster
        })

    return { clusters }
}

type PreparedEvidence = {
    item: Evidence
    normalized: string
    tokens: Set<string>
}

const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'before',
    'by',
    'can',
    'cannot',
    'check',
    'convention',
    'for',
    'from',
    'if',
    'in',
    'into',
    'is',
    'it',
    'of',
    'on',
    'or',
    'only',
    'preserve',
    'rather',
    'record',
    'reject',
    'require',
    'rule',
    'run',
    'should',
    'that',
    'their',
    'there',
    'these',
    'this',
    'those',
    'the',
    'then',
    'to',
    'treat',
    'use',
    'validate',
    'verify',
    'when',
    'write',
    'with',
])

function shouldCluster(left: PreparedEvidence, right: PreparedEvidence): boolean {
    if (left.normalized === right.normalized) {
        return true
    }

    const overlap = intersectionSize(left.tokens, right.tokens)
    if (overlap < 4) {
        return false
    }

    const smallerSize = Math.min(left.tokens.size, right.tokens.size)
    const containment = smallerSize > 0 ? overlap / smallerSize : 0
    const jaccard = overlap / unionSize(left.tokens, right.tokens)

    return jaccard >= 0.3 || (containment >= 0.5 && jaccard >= 0.24)
}

function similarityScore(left: PreparedEvidence, right: PreparedEvidence): number {
    if (left.normalized === right.normalized) {
        return 1
    }

    const overlap = intersectionSize(left.tokens, right.tokens)
    const score = overlap / unionSize(left.tokens, right.tokens)
    return Math.round(score * 100) / 100
}

function clusterFingerprint(members: PreparedEvidence[]): string {
    return sha256Hex(members.map((member) => member.normalized).sort().join('\n'))
}

function chooseRepresentative(members: PreparedEvidence[]): PreparedEvidence {
    return [...members].sort((left, right) => {
        const lengthDelta = right.tokens.size - left.tokens.size
        return lengthDelta === 0 ? left.item.id.localeCompare(right.item.id) : lengthDelta
    })[0]!
}

function tokenizeLearningText(text: string): Set<string> {
    return new Set(
        normalizeLearningText(text)
            .replace(/[^a-z0-9]+/g, ' ')
            .split(' ')
            .map(stemToken)
            .filter((token) => token.length >= 3 && !stopWords.has(token)),
    )
}

function stemToken(token: string): string {
    return token.replace(/(?:ing|ed|es|s)$/u, '')
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
    let count = 0
    for (const token of left) {
        if (right.has(token)) {
            count += 1
        }
    }
    return count
}

function unionSize(left: Set<string>, right: Set<string>): number {
    return new Set([...left, ...right]).size
}

class UnionFind {
    private readonly parents: number[]

    constructor(size: number) {
        this.parents = Array.from({ length: size }, (_, index) => index)
    }

    find(index: number): number {
        const parent = this.parents[index]
        if (parent === undefined) {
            throw new Error(`Unknown cluster index: ${index}`)
        }

        if (parent !== index) {
            this.parents[index] = this.find(parent)
        }

        return this.parents[index]!
    }

    join(left: number, right: number): void {
        const leftRoot = this.find(left)
        const rightRoot = this.find(right)
        if (leftRoot !== rightRoot) {
            this.parents[rightRoot] = leftRoot
        }
    }
}
