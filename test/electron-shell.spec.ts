import { createLearningOpsIpcHandlers } from '../src/electron/ipc-handlers.js'
import {
    createTrustedLearningOpsSenderValidator,
    isTrustedRendererUrl,
    registerLearningOpsNavigationGuards,
    registerTrustedLearningOpsIpcHandlers,
    type LearningOpsIpcEvent,
    type LearningOpsIpcMain,
} from '../src/electron/ipc-registration.js'
import { learningOpsIpcChannels } from '../src/electron/ipc-contract.js'
import { createMainWindowOptions } from '../src/electron/window-options.js'
import type { DashboardSnapshot } from '../src/index.js'
import type { PatchManifest, Proposal } from '../src/domain/schemas.js'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

describe('Electron shell security boundary', () => {
    it('creates an isolated renderer window without Node integration', () => {
        const options = createMainWindowOptions('/tmp/preload.js')

        expect(options.webPreferences?.preload).toBe('/tmp/preload.js')
        expect(options.webPreferences?.contextIsolation).toBe(true)
        expect(options.webPreferences?.nodeIntegration).toBe(false)
        expect(options.webPreferences?.sandbox).toBe(true)
    })

    it('preload exposes explicit methods without exposing raw ipcRenderer', async () => {
        const preload = await readFile(new URL('../src/electron/preload.ts', import.meta.url), 'utf8')

        expect(preload).toContain("contextBridge.exposeInMainWorld('learningOps', learningOps)")
        expect(preload).not.toContain("exposeInMainWorld('ipcRenderer'")
        expect(preload).not.toContain('...ipcRenderer')
    })

    it('ships packaged renderer content with a restrictive CSP', async () => {
        const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8')

        expect(html).toContain('http-equiv="Content-Security-Policy"')
        expect(html).toContain("default-src 'self'")
        expect(html).toContain("object-src 'none'")
        expect(html).not.toContain("script-src 'unsafe-inline'")
    })
})

describe('Electron IPC handlers', () => {
    it('validates request payloads and delegates only through the application facade', async () => {
        const snapshot = { repository: { repositoryId: 'fixture' } } as DashboardSnapshot
        const proposal = {
            schemaVersion: 1,
            id: 'proposal_1',
            repositoryId: 'fixture',
            version: 1,
            baselineId: 'baseline_1',
            createdAt: '2026-08-03T00:00:00.000Z',
            items: [],
            guardrail: 'test',
        } satisfies Proposal
        const patch = {
            schemaVersion: 1,
            id: 'patch_1',
            repositoryId: 'fixture',
            proposalId: 'proposal_1',
            targetId: 'target_1',
            targetPath: 'standards.md',
            beforeHash: 'before',
            afterHash: 'after',
            patchHash: 'patch',
            unifiedDiff: '',
            itemIds: [],
            createdAt: '2026-08-03T00:00:00.000Z',
        } satisfies PatchManifest
        const application = {
            openRepository: vi.fn(async () => snapshot),
            switchRepository: vi.fn(async () => snapshot),
            closeRepository: vi.fn(async () => undefined),
            getSnapshot: vi.fn(async () => snapshot),
            importMarkdown: vi.fn(async () => snapshot),
            clusterLearnings: vi.fn(async () => snapshot),
            proposeLearnings: vi.fn(async () => ({
                proposal,
                snapshot,
            })),
            recordProposalDecision: vi.fn(async () => snapshot),
            previewPatch: vi.fn(async () => ({
                patch,
                snapshot,
            })),
            exportMarkdown: vi.fn(async () => ({
                output: '/tmp/receipt.md',
                bytes: 1,
                snapshot,
            })),
        }
        const repositoryDialog = {
            selectRepository: vi.fn(async () => '/tmp/repo'),
            selectExportPath: vi.fn(async () => '/tmp/receipt.md'),
        }
        const handlers = createLearningOpsIpcHandlers({ application, repositoryDialog })

        await expect(handlers[learningOpsIpcChannels.openRepository]({ repositoryRoot: '   ' })).rejects.toThrow(
            /repositoryRoot/,
        )
        await expect(
            handlers[learningOpsIpcChannels.openRepository]({ repositoryRoot: '/tmp/repo', unexpected: true }),
        ).rejects.toThrow(/Unrecognized key/)
        await handlers[learningOpsIpcChannels.openRepository]({ repositoryRoot: '/tmp/repo' })
        expect(application.openRepository).toHaveBeenCalledWith({ repositoryRoot: '/tmp/repo' })

        await expect(
            handlers[learningOpsIpcChannels.recordProposalDecision]({
                proposalId: 'proposal_1',
                itemId: 'item_1',
                decision: 'approve',
                actor: '',
                rationale: 'missing actor',
            }),
        ).rejects.toThrow(/Decision actor/)
        await expect(handlers[learningOpsIpcChannels.clusterLearnings]({ unexpected: true })).rejects.toThrow()
        await expect(handlers[learningOpsIpcChannels.selectRepository]()).resolves.toBe('/tmp/repo')

        await expect(
            handlers[learningOpsIpcChannels.exportMarkdown]({
                proposalId: 'proposal_1',
                kind: 'receipt',
                output: '/tmp/renderer-controlled.md',
            }),
        ).rejects.toThrow(/Unrecognized key/)
        expect(application.exportMarkdown).not.toHaveBeenCalled()

        await expect(
            handlers[learningOpsIpcChannels.exportMarkdown]({
                proposalId: 'proposal_1',
                kind: 'receipt',
            }),
        ).resolves.toEqual({ output: '/tmp/receipt.md', bytes: 1, snapshot })
        expect(repositoryDialog.selectExportPath).toHaveBeenCalledWith({ proposalId: 'proposal_1', kind: 'receipt' })
        expect(application.exportMarkdown).toHaveBeenCalledWith({
            proposalId: 'proposal_1',
            kind: 'receipt',
            output: '/tmp/receipt.md',
        })
    })

    it('rejects untrusted IPC senders before dispatching handlers', async () => {
        const application = {
            openRepository: vi.fn(async () => ({ repository: { repositoryId: 'fixture' } }) as DashboardSnapshot),
            switchRepository: vi.fn(),
            closeRepository: vi.fn(),
            getSnapshot: vi.fn(),
            importMarkdown: vi.fn(),
            clusterLearnings: vi.fn(),
            proposeLearnings: vi.fn(),
            recordProposalDecision: vi.fn(),
            previewPatch: vi.fn(),
            exportMarkdown: vi.fn(),
        }
        const registered = new Map<string, (event: LearningOpsIpcEvent, input?: unknown) => Promise<unknown>>()
        const fakeIpcMain: LearningOpsIpcMain = {
            handle(channel, listener) {
                registered.set(channel, listener)
            },
        }
        const handlers = createLearningOpsIpcHandlers({
            application,
            repositoryDialog: { selectRepository: vi.fn(), selectExportPath: vi.fn() },
        })

        registerTrustedLearningOpsIpcHandlers({
            ipcMain: fakeIpcMain,
            handlers,
            isTrustedSender: createTrustedLearningOpsSenderValidator({
                getTrustedSender: () => ({ id: 7 }),
                getDevServerUrl: () => 'http://localhost:5173',
            }),
        })

        const openRepository = registered.get(learningOpsIpcChannels.openRepository)
        expect(openRepository).toBeDefined()

        await expect(
            openRepository?.(
                { sender: { id: 9 }, senderFrame: { url: 'http://localhost:5173/' } },
                { repositoryRoot: '/tmp/repo' },
            ),
        ).rejects.toThrow(/untrusted/i)
        expect(application.openRepository).not.toHaveBeenCalled()

        await expect(
            openRepository?.(
                { sender: { id: 7 }, senderFrame: { url: 'https://example.com/' } },
                { repositoryRoot: '/tmp/repo' },
            ),
        ).rejects.toThrow(/untrusted/i)
        expect(application.openRepository).not.toHaveBeenCalled()

        await expect(
            openRepository?.(
                { sender: { id: 7 }, senderFrame: { url: 'http://localhost:5173/dashboard' } },
                { repositoryRoot: '/tmp/repo' },
            ),
        ).resolves.toEqual({ repository: { repositoryId: 'fixture' } })
        expect(application.openRepository).toHaveBeenCalledWith({ repositoryRoot: '/tmp/repo' })
    })

    it('trusts only packaged renderer files or the configured dev server origin', () => {
        const packagedRendererUrl =
            'file:///Applications/Agent%20LearningOps.app/Contents/Resources/app/dist/renderer/index.html'
        expect(isTrustedRendererUrl(packagedRendererUrl, { packagedRendererUrl })).toBe(true)
        expect(isTrustedRendererUrl('file:///tmp/renderer/index.html', { packagedRendererUrl })).toBe(false)
        expect(isTrustedRendererUrl('file:///tmp/renderer/other.html')).toBe(false)
        expect(isTrustedRendererUrl('http://localhost:5173/dashboard', { devServerUrl: 'http://localhost:5173' })).toBe(true)
        expect(isTrustedRendererUrl('http://localhost:5174/dashboard', { devServerUrl: 'http://localhost:5173' })).toBe(false)
        expect(isTrustedRendererUrl('https://example.com/renderer/index.html', { packagedRendererUrl })).toBe(false)
    })

    it('prevents unexpected top-level navigation and denies new windows', () => {
        let navigateListener: ((event: { preventDefault(): void }, url: string) => void) | undefined
        let windowOpenListener: ((details: { url: string }) => { action: 'allow' | 'deny' }) | undefined
        const webContents = {
            on: vi.fn((event: 'will-navigate', listener: (event: { preventDefault(): void }, url: string) => void) => {
                navigateListener = listener
            }),
            setWindowOpenHandler: vi.fn((listener: (details: { url: string }) => { action: 'allow' | 'deny' }) => {
                windowOpenListener = listener
            }),
        }

        registerLearningOpsNavigationGuards(webContents, (url) => url === 'http://localhost:5173/')

        const trustedEvent = { preventDefault: vi.fn() }
        navigateListener?.(trustedEvent, 'http://localhost:5173/')
        expect(trustedEvent.preventDefault).not.toHaveBeenCalled()

        const untrustedEvent = { preventDefault: vi.fn() }
        navigateListener?.(untrustedEvent, 'https://example.com/')
        expect(untrustedEvent.preventDefault).toHaveBeenCalledTimes(1)
        expect(windowOpenListener?.({ url: 'http://localhost:5173/' })).toEqual({ action: 'deny' })
    })
})
