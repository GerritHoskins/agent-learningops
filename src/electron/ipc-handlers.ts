import type { LearningOpsDesktopApplication } from '../dashboard/application.js'
import {
    dashboardDecisionInputSchema,
    dashboardExportMarkdownInputSchema,
    dashboardPatchPreviewInputSchema,
    dashboardRepositoryInputSchema,
    parseDashboardImportInput,
} from '../dashboard/session.js'
import { learningOpsIpcChannels, type LearningOpsIpcChannel } from './ipc-contract.js'
import { z } from 'zod'

export interface RepositoryDialog {
    selectRepository(): Promise<string | undefined>
    selectExportPath(input: { proposalId: string; kind: 'proposal' | 'receipt' }): Promise<string | undefined>
}

export type LearningOpsIpcHandlers = Record<LearningOpsIpcChannel, (input?: unknown) => Promise<unknown>>

const emptyInputSchema = z.undefined().optional()
const rendererExportMarkdownInputSchema = dashboardExportMarkdownInputSchema.omit({ output: true }).strict()

export function createLearningOpsIpcHandlers(options: {
    application: LearningOpsDesktopApplication
    repositoryDialog: RepositoryDialog
}): LearningOpsIpcHandlers {
    return {
        [learningOpsIpcChannels.selectRepository]: async () => options.repositoryDialog.selectRepository(),
        [learningOpsIpcChannels.openRepository]: async (input) =>
            options.application.openRepository(dashboardRepositoryInputSchema.parse(input)),
        [learningOpsIpcChannels.switchRepository]: async (input) =>
            options.application.switchRepository(dashboardRepositoryInputSchema.parse(input)),
        [learningOpsIpcChannels.closeRepository]: async (input) => {
            emptyInputSchema.parse(input)
            return options.application.closeRepository()
        },
        [learningOpsIpcChannels.getSnapshot]: async (input) => {
            emptyInputSchema.parse(input)
            return options.application.getSnapshot()
        },
        [learningOpsIpcChannels.importMarkdown]: async (input) => options.application.importMarkdown(parseDashboardImportInput(input)),
        [learningOpsIpcChannels.clusterLearnings]: async (input) => {
            emptyInputSchema.parse(input)
            return options.application.clusterLearnings()
        },
        [learningOpsIpcChannels.proposeLearnings]: async (input) => {
            emptyInputSchema.parse(input)
            return options.application.proposeLearnings()
        },
        [learningOpsIpcChannels.recordProposalDecision]: async (input) =>
            options.application.recordProposalDecision(dashboardDecisionInputSchema.parse(input)),
        [learningOpsIpcChannels.previewPatch]: async (input) =>
            options.application.previewPatch(dashboardPatchPreviewInputSchema.parse(input)),
        [learningOpsIpcChannels.exportMarkdown]: async (input) => {
            const parsed = rendererExportMarkdownInputSchema.parse(input)
            const output = await options.repositoryDialog.selectExportPath(parsed)
            if (!output) {
                return undefined
            }

            return options.application.exportMarkdown({ ...parsed, output })
        },
    }
}
