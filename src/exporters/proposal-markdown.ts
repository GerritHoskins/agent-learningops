import type { Evidence, Proposal } from '../domain/schemas.js'

export function exportProposalMarkdown(proposal: Proposal, evidence: Evidence[]): string {
    const evidenceById = new Map(evidence.map((item) => [item.id, item]))
    const lines = [
        `# LearningOps proposal ${proposal.id}`,
        '',
        `- Repository: ${proposal.repositoryId}`,
        `- Baseline: ${proposal.baselineId}`,
        `- Created: ${proposal.createdAt}`,
        `- Guardrail: ${proposal.guardrail}`,
        '',
    ]

    for (const item of proposal.items) {
        lines.push(`## ${item.classification}: ${item.id}`, '')
        lines.push(`- Rule: ${item.ruleText}`)
        lines.push(`- Target: ${item.targetId ?? 'none'}`)
        lines.push(`- Distinct evidence: ${item.distinctEvidenceCount}`)
        lines.push(`- Rationale: ${item.rationale}`)
        for (const evidenceId of item.evidenceIds) {
            const source = evidenceById.get(evidenceId)
            if (source) {
                lines.push(`- Evidence: ${source.sourcePath}`)
            }
        }
        lines.push('')
    }

    return `${lines.join('\n').trimEnd()}\n`
}
