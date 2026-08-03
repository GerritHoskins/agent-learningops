import type { ProposalItem } from '../domain/schemas.js'

const markerStart = '<!-- agent-learningops:markdown-section:start -->'
const markerEnd = '<!-- agent-learningops:markdown-section:end -->'

export function renderMarkdownSection(existingContent: string, approvedItems: ProposalItem[]): string {
    const existingRules = extractRules(existingContent)
    const rules = [...existingRules, ...approvedItems.map((item) => item.ruleText.trim())].filter(
        (rule, index, all) => rule.length > 0 && all.indexOf(rule) === index,
    )
    const section = [
        markerStart,
        '',
        '## Agent LearningOps Proposals',
        '',
        ...rules.flatMap((rule) => [`- ${rule}`, '']),
        markerEnd,
    ].join('\n').replace(/\n{3,}/g, '\n\n')

    if (existingContent.includes(markerStart) && existingContent.includes(markerEnd)) {
        return existingContent.replace(
            new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`),
            section,
        )
    }

    return `${existingContent.trimEnd()}\n\n${section}\n`
}

function extractRules(existingContent: string): string[] {
    const start = existingContent.indexOf(markerStart)
    const end = existingContent.indexOf(markerEnd, start + markerStart.length)
    if (start < 0 || end < 0) {
        return []
    }

    return existingContent
        .slice(start + markerStart.length, end)
        .split('\n')
        .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1]?.trim())
        .filter((rule): rule is string => Boolean(rule))
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
