import type { LearningOpsDesktopApplication } from '../dashboard/application.js'
import type { LearningOpsWorkerCommand, LearningOpsWorkerPayloads } from './worker-protocol.js'

type WorkerPayload<C extends LearningOpsWorkerCommand> = LearningOpsWorkerPayloads[C]

export async function dispatchLearningOpsWorkerCommand<C extends LearningOpsWorkerCommand>(
    application: LearningOpsDesktopApplication,
    command: C,
    payload: WorkerPayload<C>,
): Promise<unknown> {
    switch (command) {
        case 'openRepository':
            return application.openRepository(payload as WorkerPayload<'openRepository'>)
        case 'switchRepository':
            return application.switchRepository(payload as WorkerPayload<'switchRepository'>)
        case 'closeRepository':
            return application.closeRepository()
        case 'getSnapshot':
            return application.getSnapshot()
        case 'importMarkdown':
            return application.importMarkdown(payload as WorkerPayload<'importMarkdown'>)
        case 'clusterLearnings':
            return application.clusterLearnings()
        case 'proposeLearnings':
            return application.proposeLearnings()
        case 'recordProposalDecision':
            return application.recordProposalDecision(payload as WorkerPayload<'recordProposalDecision'>)
        case 'previewPatch':
            return application.previewPatch(payload as WorkerPayload<'previewPatch'>)
        case 'exportMarkdown':
            return application.exportMarkdown(payload as WorkerPayload<'exportMarkdown'>)
    }
}
