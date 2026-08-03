export interface OperationMetric {
    operation: string
    count: number
    durationMs: number
    result: 'ok' | 'error'
}

export function createMetric(operation: string, startedAt: number, result: 'ok' | 'error', count = 1): OperationMetric {
    return {
        operation,
        count,
        durationMs: Date.now() - startedAt,
        result,
    }
}
