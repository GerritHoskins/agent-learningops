import { resolve } from 'node:path'

import { renderMarkdownSection } from '../adapters/markdown-section.js'
import { renderSkillReference } from '../adapters/skill-reference.js'
import { contentId, fileHash } from '../domain/ids.js'
import type { Decision, LearningOpsConfig, PatchManifest, Proposal } from '../domain/schemas.js'
import { readTargetContent, resolveTarget } from './target-registry.js'

export async function previewPolicyPatch(input: {
    repositoryRoot: string
    config: LearningOpsConfig
    proposal: Proposal
    decisions: Decision[]
    targetId: string
    now?: string
}): Promise<PatchManifest> {
    const target = await resolveTarget(input.repositoryRoot, input.config, input.targetId)
    const before = await readTargetContent(input.repositoryRoot, target)
    const beforeHash = fileHash(before)
    const effectiveDecisionsByItemId = latestDecisions(input.decisions, input.proposal.id)
    const approvedItems = input.proposal.items.filter(
        (item) =>
            item.targetId === target.id &&
            effectiveDecisionsByItemId.get(item.id)?.decision === 'approve' &&
            !effectiveDecisionsByItemId.get(item.id)?.stale &&
            effectiveDecisionsByItemId.get(item.id)?.targetId === target.id,
    )

    if (approvedItems.length === 0) {
        throw new Error(`No approved proposal items for target ${target.id}.`)
    }

    for (const item of approvedItems) {
        const decision = effectiveDecisionsByItemId.get(item.id)
        if (!decision?.targetBaseHash) {
            throw new Error(
                `Approved proposal item ${item.id} has no target base hash for ${target.id}; re-approve before previewing.`,
            )
        }

        if (decision.targetBaseHash !== beforeHash) {
            throw new Error(
                `Stale approval for proposal item ${item.id}: target ${target.id} changed from ${decision.targetBaseHash} to ${beforeHash}; re-approve before previewing.`,
            )
        }
    }

    const after = target.adapter === 'markdown-section'
        ? renderMarkdownSection(before, approvedItems)
        : renderSkillReference(before, approvedItems)
    const afterHash = fileHash(after)
    const unifiedDiff = createUnifiedDiff(target.path, before, after)
    const patchHash = fileHash(unifiedDiff)
    const itemIds = approvedItems.map((item) => item.id).sort()

    return {
        schemaVersion: 1,
        id: contentId('patch', {
            proposalId: input.proposal.id,
            targetId: target.id,
            itemIds,
            beforeHash,
            afterHash,
            patchHash,
        }),
        repositoryId: input.proposal.repositoryId,
        proposalId: input.proposal.id,
        targetId: target.id,
        targetPath: resolve(input.repositoryRoot, target.path),
        beforeHash,
        afterHash,
        patchHash,
        unifiedDiff,
        itemIds,
        createdAt: input.now ?? new Date().toISOString(),
    }
}

function latestDecisions(decisions: Decision[], proposalId: string): Map<string, Decision> {
    const latest = new Map<string, Decision>()
    const relevant = decisions
        .filter((decision) => decision.proposalId === proposalId)
        .sort((left, right) => {
            const timeOrder = left.decidedAt.localeCompare(right.decidedAt)
            return timeOrder === 0 ? left.id.localeCompare(right.id) : timeOrder
        })

    for (const decision of relevant) {
        latest.set(decision.itemId, decision)
    }

    return latest
}

function createUnifiedDiff(path: string, before: string, after: string): string {
    if (before === after) {
        return ''
    }

    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    return [
        `--- a/${path}`,
        `+++ b/${path}`,
        `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
        ...beforeLines.map((line) => `-${line}`),
        ...afterLines.map((line) => `+${line}`),
        '',
    ].join('\n')
}
