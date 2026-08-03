import { contentId } from '../domain/ids.js'
import type { Decision, DecisionKind, Proposal } from '../domain/schemas.js'

export function recordDecision(input: {
    proposal: Proposal
    itemId: string
    decision: DecisionKind
    actor: string
    rationale: string
    targetBaseHash?: string
    now?: string
}): Decision {
    const item = input.proposal.items.find((candidate) => candidate.id === input.itemId)

    if (!item) {
        throw new Error(`Unknown proposal item: ${input.itemId}`)
    }

    if (!input.actor.trim()) {
        throw new Error('Decision actor is required.')
    }

    if (!input.rationale.trim()) {
        throw new Error('Decision rationale is required.')
    }

    return {
        schemaVersion: 1,
        id: contentId('decision', {
            proposalId: input.proposal.id,
            proposalVersion: input.proposal.version,
            itemId: input.itemId,
            decision: input.decision,
            actor: input.actor,
            rationale: input.rationale,
        }),
        repositoryId: input.proposal.repositoryId,
        proposalId: input.proposal.id,
        proposalVersion: input.proposal.version,
        itemId: input.itemId,
        decision: input.decision,
        actor: input.actor,
        rationale: input.rationale,
        targetId: item.targetId,
        targetBaseHash: input.targetBaseHash ?? item.targetBaseHash,
        expectedPatchHash: item.expectedPatchHash,
        decidedAt: input.now ?? new Date().toISOString(),
        stale: false,
    }
}
