import {
    dashboardDecisionInputSchema,
    dashboardExportMarkdownInputSchema,
    dashboardImportInputSchema,
    dashboardPatchPreviewInputSchema,
    dashboardRepositoryInputSchema,
} from '../dashboard/session.js'
import { z } from 'zod'

export const learningOpsWorkerProtocolVersion = 1

const emptyPayloadSchema = z.undefined().optional()

export const learningOpsWorkerCommandSchemas = {
    openRepository: dashboardRepositoryInputSchema,
    switchRepository: dashboardRepositoryInputSchema,
    closeRepository: emptyPayloadSchema,
    getSnapshot: emptyPayloadSchema,
    importMarkdown: dashboardImportInputSchema,
    clusterLearnings: emptyPayloadSchema,
    proposeLearnings: emptyPayloadSchema,
    recordProposalDecision: dashboardDecisionInputSchema,
    previewPatch: dashboardPatchPreviewInputSchema,
    exportMarkdown: dashboardExportMarkdownInputSchema,
} as const

export type LearningOpsWorkerCommand = keyof typeof learningOpsWorkerCommandSchemas

export interface LearningOpsWorkerPayloads {
    openRepository: { repositoryRoot: string }
    switchRepository: { repositoryRoot: string }
    closeRepository: undefined
    getSnapshot: undefined
    importMarkdown: { since?: string; skill?: string } | undefined
    clusterLearnings: undefined
    proposeLearnings: undefined
    recordProposalDecision: {
        proposalId: string
        itemId: string
        decision: 'approve' | 'reject' | 'defer'
        actor: string
        rationale: string
    }
    previewPatch: { proposalId: string; targetId: string }
    exportMarkdown: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }
}

const requestIdSchema = z.string().trim().min(1)

const workerRequestSchemas = Object.entries(learningOpsWorkerCommandSchemas).map(([command, payloadSchema]) =>
    z
        .object({
            protocolVersion: z.literal(learningOpsWorkerProtocolVersion),
            id: requestIdSchema,
            command: z.literal(command),
            payload: payloadSchema,
        })
        .strict(),
)

export const learningOpsWorkerRequestSchema = z.union(
    workerRequestSchemas as [
        (typeof workerRequestSchemas)[number],
        (typeof workerRequestSchemas)[number],
        ...Array<(typeof workerRequestSchemas)[number]>,
    ],
)

export type LearningOpsWorkerRequest = z.infer<typeof learningOpsWorkerRequestSchema>

export const learningOpsWorkerResponseSchema = z.discriminatedUnion('ok', [
    z
        .object({
            protocolVersion: z.literal(learningOpsWorkerProtocolVersion),
            id: requestIdSchema,
            ok: z.literal(true),
            result: z.unknown(),
        })
        .strict(),
    z
        .object({
            protocolVersion: z.literal(learningOpsWorkerProtocolVersion),
            id: requestIdSchema,
            ok: z.literal(false),
            error: z
                .object({
                    name: z.string().trim().min(1),
                    message: z.string(),
                    stack: z.string().optional(),
                })
                .strict(),
        })
        .strict(),
])

export type LearningOpsWorkerResponse = z.infer<typeof learningOpsWorkerResponseSchema>

export function createWorkerError(error: unknown): { name: string; message: string; stack?: string } {
    if (error instanceof Error) {
        return {
            name: error.name || 'Error',
            message: error.message,
            ...(error.stack ? { stack: error.stack } : {}),
        }
    }

    return { name: 'Error', message: String(error) }
}

export function toWorkerError(error: { name: string; message: string; stack?: string | undefined }): Error {
    const workerError = new Error(error.message)
    workerError.name = error.name
    if (error.stack) {
        workerError.stack = error.stack
    }
    return workerError
}
