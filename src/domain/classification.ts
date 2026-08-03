import type { Classification } from './schemas.js'

export const classifierVersion = 'criteria-v1'

export interface ClassificationInput {
    distinctEvidenceCount: number
    skillCount: number
    ruleText: string
    warnings: string[]
}

export interface ClassificationResult {
    classification: Classification
    rationale: string
    risks: string[]
}

export function classifyRule(input: ClassificationInput): ClassificationResult {
    const quality = validateRuleText(input.ruleText)

    if (!quality.valid) {
        return {
            classification: 'SKIP',
            rationale: quality.reason,
            risks: [...input.warnings, quality.reason],
        }
    }

    if (input.distinctEvidenceCount >= 2 && input.skillCount >= 1) {
        return {
            classification: 'PROMOTE',
            rationale: 'Repeated, actionable learning with distinct source evidence.',
            risks: input.warnings,
        }
    }

    if (input.distinctEvidenceCount === 1) {
        return {
            classification: 'NEEDS_VERIFICATION',
            rationale: 'Actionable learning has only one distinct source so far.',
            risks: ['Needs another independent occurrence before promotion.', ...input.warnings],
        }
    }

    return {
        classification: 'SKIP',
        rationale: 'No distinct evidence supports the rule.',
        risks: input.warnings,
    }
}

export function validateRuleText(ruleText: string): { valid: true } | { valid: false; reason: string } {
    const words = ruleText.trim().split(/\s+/).filter(Boolean)

    if (words.length === 0) {
        return { valid: false, reason: 'Rule text is empty.' }
    }

    if (words.length > 20) {
        return { valid: false, reason: 'Rule text exceeds the 20-word MVP limit.' }
    }

    if (/^(maybe|consider|might|could|probably)\b/i.test(ruleText)) {
        return { valid: false, reason: 'Rule text is tentative rather than imperative.' }
    }

    if (/[?]$/.test(ruleText.trim())) {
        return { valid: false, reason: 'Rule text is phrased as a question.' }
    }

    return { valid: true }
}
