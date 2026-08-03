import { createLearningOpsDesktopApplication } from '../src/dashboard/application.js'
import { dispatchLearningOpsWorkerCommand } from '../src/electron/worker-dispatcher.js'
import { createLearningOpsWorkerClient, type LearningOpsWorkerLike } from '../src/electron/worker-client.js'
import {
    createWorkerError,
    learningOpsWorkerProtocolVersion,
    learningOpsWorkerRequestSchema,
    type LearningOpsWorkerResponse,
} from '../src/electron/worker-protocol.js'
import { createFixtureRepo } from './helpers/tmp.js'
import { EventEmitter } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

class FakeWorker extends EventEmitter implements LearningOpsWorkerLike {
    messages: unknown[] = []
    responseFactory: (message: unknown) => LearningOpsWorkerResponse | undefined = (message) => {
        const request = learningOpsWorkerRequestSchema.parse(message)
        return {
            protocolVersion: learningOpsWorkerProtocolVersion,
            id: request.id,
            ok: true,
            result: request.command === 'closeRepository' ? undefined : { command: request.command },
        }
    }

    postMessage(message: unknown): void {
        this.messages.push(message)
        queueMicrotask(() => {
            const response = this.responseFactory(message)
            if (response) {
                this.emit('message', response)
            }
        })
    }

    async terminate(): Promise<number> {
        this.emit('exit', 0)
        return 0
    }
}

describe('Electron worker client protocol', () => {
    it('sends strict request envelopes and resolves matching worker responses', async () => {
        const worker = new FakeWorker()
        const client = createLearningOpsWorkerClient({ workerFactory: () => worker })

        await expect(client.openRepository({ repositoryRoot: '/tmp/repo' })).resolves.toEqual({ command: 'openRepository' })

        const request = learningOpsWorkerRequestSchema.parse(worker.messages[0])
        expect(request.protocolVersion).toBe(learningOpsWorkerProtocolVersion)
        expect(request.command).toBe('openRepository')
        expect(request.payload).toEqual({ repositoryRoot: '/tmp/repo' })

        await client.shutdown()
    })

    it('propagates structured worker errors and cleans up pending requests', async () => {
        const worker = new FakeWorker()
        worker.responseFactory = (message) => {
            const request = learningOpsWorkerRequestSchema.parse(message)
            return {
                protocolVersion: learningOpsWorkerProtocolVersion,
                id: request.id,
                ok: false,
                error: createWorkerError(new TypeError('worker validation failed')),
            }
        }
        const client = createLearningOpsWorkerClient({ workerFactory: () => worker })

        await expect(client.getSnapshot()).rejects.toThrow(/worker validation failed/)
    })

    it('keeps the worker alive when only the repository is closed', async () => {
        const worker = new FakeWorker()
        const client = createLearningOpsWorkerClient({ workerFactory: () => worker })

        await expect(client.closeRepository()).resolves.toBeUndefined()
        await expect(client.openRepository({ repositoryRoot: '/tmp/repo' })).resolves.toEqual({ command: 'openRepository' })

        await client.shutdown()
    })

    it('rejects pending requests when the worker exits', async () => {
        const worker = new FakeWorker()
        worker.responseFactory = () => undefined
        const client = createLearningOpsWorkerClient({ workerFactory: () => worker })
        const pending = client.getSnapshot()

        worker.emit('exit', 1)

        await expect(pending).rejects.toThrow(/exited with code 1/)
    })

    it('closes the client after an invalid worker protocol response', async () => {
        const worker = new FakeWorker()
        worker.responseFactory = () => ({ invalid: true }) as unknown as LearningOpsWorkerResponse
        const client = createLearningOpsWorkerClient({ workerFactory: () => worker })

        await expect(client.getSnapshot()).rejects.toThrow(/Invalid LearningOps worker response/)
        await expect(client.getSnapshot()).rejects.toThrow(/worker is closed/)
    })
})

describe('Electron worker dispatcher', () => {
    afterEach(() => {
        delete process.env.LEARNINGOPS_STATE_DIR
    })

    it('executes dashboard application commands behind the worker boundary', async () => {
        const repositoryRoot = await createFixtureRepo()
        process.env.LEARNINGOPS_STATE_DIR = await mkdtemp(join(tmpdir(), 'learningops-worker-state-'))
        const application = createLearningOpsDesktopApplication()

        try {
            const snapshot = await dispatchLearningOpsWorkerCommand(application, 'openRepository', { repositoryRoot })
            expect(snapshot).toMatchObject({ repository: { repositoryRoot, repositoryId: 'fixture' } })

            const imported = await dispatchLearningOpsWorkerCommand(application, 'importMarkdown', {})
            expect(imported).toMatchObject({ overview: { counts: { learnings: 2 } } })

            await expect(dispatchLearningOpsWorkerCommand(application, 'openRepository', { repositoryRoot })).rejects.toThrow(
                /already open/,
            )
        } finally {
            await application.closeRepository()
        }
    })
})
