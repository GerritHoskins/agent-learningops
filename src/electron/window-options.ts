import type { BrowserWindowConstructorOptions } from 'electron'

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
    return {
        width: 1280,
        height: 860,
        minWidth: 1024,
        minHeight: 720,
        show: false,
        title: 'Agent LearningOps',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    }
}
