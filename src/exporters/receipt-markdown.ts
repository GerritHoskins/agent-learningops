import type { Decision, Proposal } from '../domain/schemas.js'

export function exportReceiptMarkdown(proposal: Proposal, decisions: Decision[]): string {
    const relevant = decisions.filter((decision) => decision.proposalId === proposal.id)
    const lines = [
        `# LearningOps receipt ${proposal.id}`,
        '',
        `- Repository: ${proposal.repositoryId}`,
        `- Proposal version: ${proposal.version}`,
        '',
    ]

    for (const decision of relevant) {
        lines.push(`## ${decision.decision.toUpperCase()}: ${decision.itemId}`, '')
        lines.push(`- Actor: ${decision.actor}`)
        lines.push(`- Rationale: ${decision.rationale}`)
        lines.push(`- Target: ${decision.targetId ?? 'none'}`)
        lines.push(`- Stale: ${decision.stale ? 'yes' : 'no'}`)
        lines.push('')
    }

    return `${lines.join('\n').trimEnd()}\n`
}
