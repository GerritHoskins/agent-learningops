import { z } from 'zod'

export const emptyInputSchema = {}

export const proposalInputSchema = {
    proposalId: z.string(),
}

export const decisionInputSchema = {
    proposalId: z.string(),
    itemId: z.string(),
    decision: z.enum(['approve', 'reject', 'defer']),
    actor: z.string(),
    reason: z.string(),
}

export const patchPreviewInputSchema = {
    proposalId: z.string(),
    targetId: z.string(),
}

export const submitLearningInputSchema = {
    text: z.string(),
    skill: z.string().optional(),
    ticket: z.string().optional(),
}
