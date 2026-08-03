const secretPatterns = [/ghp_[A-Za-z0-9_]+/g, /xox[baprs]-[A-Za-z0-9-]+/g, /Bearer\s+[A-Za-z0-9._-]+/g]

export function redact(value: string): string {
    return secretPatterns
        .reduce((current, pattern) => current.replace(pattern, '[REDACTED]'), value)
        .replace(/\/Users\/[^/\s]+/g, '[HOME]')
}

export function logEvent(event: string, data: Record<string, unknown> = {}): void {
    const safeData = JSON.parse(redact(JSON.stringify(data))) as Record<string, unknown>
    process.stderr.write(`${JSON.stringify({ event, ...safeData })}\n`)
}
