export function normalizeLearningDate(value: string): string {
    const compact = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{6})?/u)
    if (compact) {
        return `${compact[1]}-${compact[2]}-${compact[3]}${compact[4] ? `T${compact[4]}` : ''}`
    }

    return value
}
