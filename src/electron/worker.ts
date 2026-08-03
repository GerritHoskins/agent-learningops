import { createLearningOpsDesktopApplication } from '../dashboard/application.js'
import { dispatchLearningOpsWorkerCommand } from './worker-dispatcher.js'
import {
    createWorkerError,
    learningOpsWorkerProtocolVersion,
    learningOpsWorkerRequestSchema,
    type LearningOpsWorkerCommand,
    type LearningOpsWorkerPayloads,
    type LearningOpsWorkerResponse,
} from './worker-protocol.js'
import { parentPort } from 'node:worker_threads'

if (!parentPort) {
    throw new Error('LearningOps worker must run inside a worker thread.')
}

const application = createLearningOpsDesktopApplication()
let queue = Promise.resolve()

parentPort.on('message', (message: unknown) => {
    queue = queue.then(() => handleWorkerMessage(message)).catch((error: unknown) => {
        parentPort?.postMessage({
            protocolVersion: learningOpsWorkerProtocolVersion,
            id: 'worker-unhandled',
            ok: false,
            error: createWorkerError(error),
        } satisfies LearningOpsWorkerResponse)
    })
})

process.once('beforeExit', () => {
    void application.closeRepository()
})

async function handleWorkerMessage(message: unknown): Promise<void> {
    const request = learningOpsWorkerRequestSchema.parse(message)

    try {
        const command = request.command as LearningOpsWorkerCommand
        const payload = request.payload as LearningOpsWorkerPayloads[typeof command]
        const result = await dispatchLearningOpsWorkerCommand(application, command, payload)
        parentPort?.postMessage({
            protocolVersion: learningOpsWorkerProtocolVersion,
            id: request.id,
            ok: true,
            result,
        } satisfies LearningOpsWorkerResponse)
    } catch (error) {
        parentPort?.postMessage({
            protocolVersion: learningOpsWorkerProtocolVersion,
            id: request.id,
            ok: false,
            error: createWorkerError(error),
        } satisfies LearningOpsWorkerResponse)
    }
}
