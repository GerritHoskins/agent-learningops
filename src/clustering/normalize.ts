export function normalizeLearningText(text: string): string {
    return text
        .normalize('NFKC')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[[^\]]+\]\([^)]+\)/g, '')
        .replace(/\bSAPP-\d+\b/gi, '')
        .replace(/\b20\d{2}-\d{2}-\d{2}(?:T[\d:.-]+Z?)?\b/g, '')
        .replace(/^[\s>*#-]+/gm, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

export function toRuleText(text: string): string {
    const cleaned = text
        .replace(/^[\s>*#-]+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.。]+$/, '')

    if (/^(when|if|treat|keep|use|verify|validate|check|preserve|avoid|run|write|record|reject|require)\b/i.test(cleaned)) {
        return cleaned
    }

    return `Use ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`
}
