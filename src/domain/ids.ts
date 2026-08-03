import { createHash } from 'node:crypto'

export function canonicalJson(value: unknown): string {
    return JSON.stringify(sortForJson(value))
}

export function sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex')
}

export function contentId(prefix: string, value: unknown): string {
    return `${prefix}_${sha256Hex(canonicalJson(value)).slice(0, 24)}`
}

export function fileHash(content: string): string {
    return sha256Hex(content)
}

function sortForJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortForJson)
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, entry]) => entry !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, sortForJson(entry)]),
        )
    }

    return value
}
