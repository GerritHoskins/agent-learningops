import type { LearningOpsIpcChannel } from './ipc-contract.js'
import type { LearningOpsIpcHandlers } from './ipc-handlers.js'

export interface LearningOpsIpcEvent {
    sender: { id: number }
    senderFrame?: { url: string } | null
}

export interface LearningOpsIpcMain {
    handle(channel: string, listener: (event: LearningOpsIpcEvent, input?: unknown) => Promise<unknown>): void
}

export interface LearningOpsNavigationEvent {
    preventDefault(): void
}

export interface LearningOpsWindowOpenDetails {
    url: string
}

export interface LearningOpsNavigationGuardWebContents {
    on(event: 'will-navigate', listener: (event: LearningOpsNavigationEvent, url: string) => void): void
    setWindowOpenHandler(listener: (details: LearningOpsWindowOpenDetails) => { action: 'allow' | 'deny' }): void
}

export interface TrustedSender {
    id: number
}

export function registerTrustedLearningOpsIpcHandlers(options: {
    ipcMain: LearningOpsIpcMain
    handlers: LearningOpsIpcHandlers
    isTrustedSender: (event: LearningOpsIpcEvent) => boolean
}): void {
    for (const [channel, handler] of Object.entries(options.handlers) as Array<
        [LearningOpsIpcChannel, LearningOpsIpcHandlers[LearningOpsIpcChannel]]
    >) {
        options.ipcMain.handle(channel, async (event, input) => {
            if (!options.isTrustedSender(event)) {
                throw new Error(`Rejected untrusted LearningOps IPC sender for ${channel}.`)
            }

            return handler(input)
        })
    }
}

export function createTrustedLearningOpsSenderValidator(options: {
    getTrustedSender: () => TrustedSender | undefined
    getDevServerUrl?: () => string | undefined
    getPackagedRendererUrl?: () => string | undefined
}): (event: LearningOpsIpcEvent) => boolean {
    return (event) => {
        const trustedSender = options.getTrustedSender()
        if (!trustedSender || event.sender.id !== trustedSender.id) {
            return false
        }

        return isTrustedRendererUrl(event.senderFrame?.url, {
            devServerUrl: options.getDevServerUrl?.(),
            packagedRendererUrl: options.getPackagedRendererUrl?.(),
        })
    }
}

export function registerLearningOpsNavigationGuards(
    webContents: LearningOpsNavigationGuardWebContents,
    isTrustedUrl: (url: string) => boolean,
): void {
    webContents.on('will-navigate', (event, url) => {
        if (!isTrustedUrl(url)) {
            event.preventDefault()
        }
    })
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

export function isTrustedRendererUrl(
    url: string | undefined,
    options: { devServerUrl?: string | undefined; packagedRendererUrl?: string | undefined } = {},
): boolean {
    if (!url) {
        return false
    }

    if (url.startsWith('file://')) {
        return Boolean(options.packagedRendererUrl && url === options.packagedRendererUrl)
    }

    if (!options.devServerUrl) {
        return false
    }

    try {
        return new URL(url).origin === new URL(options.devServerUrl).origin
    } catch {
        return false
    }
}
