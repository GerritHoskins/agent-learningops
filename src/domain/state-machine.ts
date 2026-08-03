export const learningStates = [
    'CAPTURED',
    'NORMALIZED',
    'CLUSTERED',
    'PROPOSED',
    'APPROVED',
    'PATCH_GENERATED',
    'RECEIPT_RECORDED',
    'REJECTED',
    'DEFERRED',
    'SUPERSEDED',
    'ROLLED_BACK',
] as const

export type LearningState = (typeof learningStates)[number]

const legalTransitions: Record<LearningState, LearningState[]> = {
    CAPTURED: ['NORMALIZED', 'SUPERSEDED'],
    NORMALIZED: ['CLUSTERED', 'SUPERSEDED'],
    CLUSTERED: ['PROPOSED', 'SUPERSEDED'],
    PROPOSED: ['APPROVED', 'REJECTED', 'DEFERRED', 'SUPERSEDED'],
    APPROVED: ['PATCH_GENERATED', 'SUPERSEDED'],
    PATCH_GENERATED: ['RECEIPT_RECORDED', 'SUPERSEDED'],
    RECEIPT_RECORDED: ['ROLLED_BACK'],
    REJECTED: ['SUPERSEDED'],
    DEFERRED: ['PROPOSED', 'SUPERSEDED'],
    SUPERSEDED: [],
    ROLLED_BACK: [],
}

export function assertLegalTransition(from: LearningState, to: LearningState): void {
    if (!legalTransitions[from]?.includes(to)) {
        throw new Error(`Illegal LearningOps transition: ${from} -> ${to}`)
    }
}

export function canTransition(from: LearningState, to: LearningState): boolean {
    return legalTransitions[from]?.includes(to) ?? false
}
