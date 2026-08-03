import type { LearningOpsDesktopApplication } from '../dashboard/application.js'
import type { DecisionKind } from '../domain/schemas.js'
import {
    learningOpsWorkerProtocolVersion,
    learningOpsWorkerResponseSchema,
    toWorkerError,
    type LearningOpsWorkerCommand,
    type LearningOpsWorkerPayloads,
    type LearningOpsWorkerRequest,
} from './worker-protocol.js'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

type WorkerPayload<C extends LearningOpsWorkerCommand> = LearningOpsWorkerPayloads[C]

export interface LearningOpsWorkerLike {
    postMessage(message: unknown): void
    on(event: 'message', listener: (message: unknown) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'exit', listener: (code: number) => void): this
    off(event: 'message', listener: (message: unknown) => void): this
    off(event: 'error', listener: (error: Error) => void): this
    off(event: 'exit', listener: (code: number) => void): this
    terminate(): Promise<number>
}

export interface LearningOpsWorkerClientOptions {
    workerPath?: string
    workerFactory?: () => LearningOpsWorkerLike
}

export interface LearningOpsWorkerService extends LearningOpsDesktopApplication {
    shutdown(): Promise<void>
}

export function resolveLearningOpsWorkerPath(baseDirectory = dirname(fileURLToPath(import.meta.url))): string {
    return join(baseDirectory, 'worker.js')
}

export function createLearningOpsWorkerClient(options: LearningOpsWorkerClientOptions = {}): LearningOpsWorkerService {
    return new LearningOpsWorkerClient(options.workerFactory?.() ?? createNodeWorker(options.workerPath))
}

function createNodeWorker(workerPath = resolveLearningOpsWorkerPath()): LearningOpsWorkerLike {
    return new Worker(workerPath, { execArgv: [] })
}

class LearningOpsWorkerClient implements LearningOpsWorkerService {
    private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
    private closed = false

    constructor(private readonly worker: LearningOpsWorkerLike) {
        this.worker.on('message', this.handleMessage)
        this.worker.on('error', this.handleError)
        this.worker.on('exit', this.handleExit)
    }

    openRepository(input: { repositoryRoot: string }) {
        return this.send('openRepository', input) as ReturnType<LearningOpsDesktopApplication['openRepository']>
    }

    switchRepository(input: { repositoryRoot: string }) {
        return this.send('switchRepository', input) as ReturnType<LearningOpsDesktopApplication['switchRepository']>
    }

    closeRepository(): Promise<void> {
        if (this.closed) {
            return Promise.resolve()
        }

        return this.send('closeRepository', undefined) as Promise<void>
    }

    async shutdown(): Promise<void> {
        if (this.closed) {
            return
        }

        try {
            await this.send('closeRepository', undefined)
        } finally {
            await this.terminate()
        }
    }

    getSnapshot() {
        return this.send('getSnapshot', undefined) as ReturnType<LearningOpsDesktopApplication['getSnapshot']>
    }

    importMarkdown(input: { since?: string; skill?: string } = {}) {
        return this.send('importMarkdown', input) as ReturnType<LearningOpsDesktopApplication['importMarkdown']>
    }

    clusterLearnings() {
        return this.send('clusterLearnings', undefined) as ReturnType<LearningOpsDesktopApplication['clusterLearnings']>
    }

    proposeLearnings() {
        return this.send('proposeLearnings', undefined) as ReturnType<LearningOpsDesktopApplication['proposeLearnings']>
    }

    recordProposalDecision(input: {
        proposalId: string
        itemId: string
        decision: DecisionKind
        actor: string
        rationale: string
    }) {
        return this.send('recordProposalDecision', input) as ReturnType<
            LearningOpsDesktopApplication['recordProposalDecision']
        >
    }

    previewPatch(input: { proposalId: string; targetId: string }) {
        return this.send('previewPatch', input) as ReturnType<LearningOpsDesktopApplication['previewPatch']>
    }

    exportMarkdown(input: { proposalId: string; kind: 'proposal' | 'receipt'; output: string }) {
        return this.send('exportMarkdown', input) as ReturnType<LearningOpsDesktopApplication['exportMarkdown']>
    }

    private send<C extends LearningOpsWorkerCommand>(command: C, payload: WorkerPayload<C>): Promise<unknown> {
        if (this.closed) {
            return Promise.reject(new Error('LearningOps worker is closed.'))
        }

        const id = randomUUID()
        const request = {
            protocolVersion: learningOpsWorkerProtocolVersion,
            id,
            command,
            payload,
        } satisfies LearningOpsWorkerRequest

        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            try {
                this.worker.postMessage(request)
            } catch (error) {
                this.pending.delete(id)
                reject(error instanceof Error ? error : new Error(String(error)))
            }
        })
    }

    private readonly handleMessage = (message: unknown): void => {
        const parsed = learningOpsWorkerResponseSchema.safeParse(message)
        if (!parsed.success) {
            this.closed = true
            this.detachListeners()
            this.failAll(new Error(`Invalid LearningOps worker response: ${parsed.error.message}`))
            void this.worker.terminate()
            return
        }

        const pending = this.pending.get(parsed.data.id)
        if (!pending) {
            return
        }

        this.pending.delete(parsed.data.id)
        if (parsed.data.ok) {
            pending.resolve(parsed.data.result)
            return
        }

        pending.reject(toWorkerError(parsed.data.error))
    }

    private readonly handleError = (error: Error): void => {
        this.closed = true
        this.failAll(error)
    }

    private readonly handleExit = (code: number): void => {
        this.closed = true
        this.failAll(new Error(`LearningOps worker exited with code ${code}.`))
    }

    private async terminate(): Promise<void> {
        if (this.closed) {
            return
        }

        this.closed = true
        this.detachListeners()
        this.failAll(new Error('LearningOps worker terminated.'))
        await this.worker.terminate()
    }

    private detachListeners(): void {
        this.worker.off('message', this.handleMessage)
        this.worker.off('error', this.handleError)
        this.worker.off('exit', this.handleExit)
    }

    private failAll(error: Error): void {
        for (const pending of this.pending.values()) {
            pending.reject(error)
        }
        this.pending.clear()
    }
}
