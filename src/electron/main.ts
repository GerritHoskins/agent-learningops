import { createLearningOpsIpcHandlers } from './ipc-handlers.js'
import {
    createTrustedLearningOpsSenderValidator,
    isTrustedRendererUrl,
    registerLearningOpsNavigationGuards,
    registerTrustedLearningOpsIpcHandlers,
} from './ipc-registration.js'
import { learningOpsIpcChannels } from './ipc-contract.js'
import { createMainWindowOptions } from './window-options.js'
import {
    createLearningOpsWorkerClient,
    resolveLearningOpsWorkerPath,
    type LearningOpsWorkerService,
} from './worker-client.js'
import type { LearningOpsDesktopApplication } from '../dashboard/application.js'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const packagedRendererPath = join(currentDirectory, '../renderer/index.html')
let mainWindow: BrowserWindow | undefined
let learningOpsWorker: LearningOpsWorkerService | undefined
let isQuittingAfterWorkerShutdown = false

function getPackagedRendererUrl(): string {
    return pathToFileURL(packagedRendererPath).href
}

function registerIpcHandlers(application: LearningOpsDesktopApplication): void {
    const handlers = createLearningOpsIpcHandlers({
        application,
        repositoryDialog: {
            async selectRepository() {
                const result = await dialog.showOpenDialog({
                    title: 'Select repository',
                    properties: ['openDirectory'],
                })
                return result.canceled ? undefined : result.filePaths[0]
            },
            async selectExportPath(input) {
                const options = {
                    title: `Export ${input.kind} markdown`,
                    defaultPath: `learningops-${input.kind}.md`,
                    filters: [{ name: 'Markdown', extensions: ['md'] }],
                }
                const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
                return result.canceled ? undefined : result.filePath
            },
        },
    })

    registerTrustedLearningOpsIpcHandlers({
        ipcMain,
        handlers,
        isTrustedSender: createTrustedLearningOpsSenderValidator({
            getTrustedSender: () => mainWindow?.webContents,
            getDevServerUrl: () => process.env.VITE_DEV_SERVER_URL,
            getPackagedRendererUrl,
        }),
    })
}

async function createMainWindow(): Promise<BrowserWindow> {
    const window = new BrowserWindow(createMainWindowOptions(join(currentDirectory, 'preload.js')))
    mainWindow = window
    registerLearningOpsNavigationGuards(window.webContents, (url) =>
        isTrustedRendererUrl(url, {
            devServerUrl: process.env.VITE_DEV_SERVER_URL,
            packagedRendererUrl: getPackagedRendererUrl(),
        }),
    )
    window.once('closed', () => {
        if (mainWindow === window) {
            mainWindow = undefined
        }
    })
    window.once('ready-to-show', () => {
        window.show()
    })

    const devServerUrl = process.env.VITE_DEV_SERVER_URL
    if (devServerUrl) {
        await window.loadURL(devServerUrl)
    } else {
        await window.loadFile(packagedRendererPath)
    }

    return window
}

app.whenReady().then(async () => {
    learningOpsWorker = createLearningOpsWorkerClient({
        workerPath: resolveLearningOpsWorkerPath(currentDirectory),
    })
    await createMainWindow()
    registerIpcHandlers(learningOpsWorker)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            void createMainWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('will-quit', (event) => {
    if (!learningOpsWorker || isQuittingAfterWorkerShutdown) {
        return
    }

    event.preventDefault()
    isQuittingAfterWorkerShutdown = true
    void learningOpsWorker.shutdown().finally(() => {
        learningOpsWorker = undefined
        app.quit()
    })
})

export { createMainWindow, getPackagedRendererUrl, registerIpcHandlers, learningOpsIpcChannels }
