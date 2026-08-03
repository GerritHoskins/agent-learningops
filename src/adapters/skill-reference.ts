import type { ProposalItem } from '../domain/schemas.js'

export function renderSkillReference(existingContent: string, approvedItems: ProposalItem[]): string {
    const markerStart = '<!-- agent-learningops:start -->'
    const markerEnd = '<!-- agent-learningops:end -->'
    const lines = [
        markerStart,
        '',
        '## Agent LearningOps Proposals',
        '',
        ...approvedItems.flatMap((item) => [`- ${item.ruleText}`, '']),
        markerEnd,
    ]
    const section = lines.join('\n').replace(/\n{3,}/g, '\n\n')

    if (existingContent.includes(markerStart) && existingContent.includes(markerEnd)) {
        return existingContent.replace(
            new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`),
            section,
        )
    }

    return `${existingContent.trimEnd()}\n\n${section}\n`
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
