import { access, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { configSchema } from '../../src/domain/schemas.js'

const root = process.cwd()
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
    main?: string
    productName?: string
    scripts?: Record<string, string>
    build?: {
        appId?: string
        asar?: boolean
        files?: string[]
        mac?: { identity?: string | null; target?: string[] }
    }
}

assert(packageJson.main === './dist/electron/main.js', 'package main must point at the built Electron main entry')
assert(packageJson.productName === 'Agent LearningOps', 'product name must be product-neutral')
assert(packageJson.scripts?.['electron:start'] === 'pnpm build && electron .', 'electron:start must boot package main')
assert(packageJson.scripts?.['package:mac:dir']?.includes('electron-builder'), 'package:mac:dir must use electron-builder')
assert(packageJson.build?.appId === 'local.agent-learningops.desktop', 'appId must be product-neutral')
assert(packageJson.build?.asar === false, 'asar must stay disabled so worker_threads can load built ESM modules')
assert(packageJson.build?.mac?.identity === null, 'local package must not require signing identity')

configSchema.parse(JSON.parse(await readFile(join(root, 'agent-learningops.config.example.json'), 'utf8')))

const builtFiles = [
    'dist/electron/main.js',
    'dist/electron/preload.js',
    'dist/electron/worker.js',
    'dist/renderer/index.html',
]

for (const file of builtFiles) {
    await assertReadable(join(root, file), `missing built file: ${file}`)
}
await assertLocalRendererAssets(join(root, 'dist/renderer/index.html'))

const appRoot = await firstExisting([
    join(root, 'release/mac/Agent LearningOps.app'),
    join(root, 'release/mac-arm64/Agent LearningOps.app'),
    join(root, 'release/mac-universal/Agent LearningOps.app'),
])
if (appRoot) {
    const resourcesApp = join(appRoot, 'Contents/Resources/app')
    for (const file of builtFiles) {
        await assertReadable(join(resourcesApp, file), `missing packaged file: ${file}`)
    }
    await assertLocalRendererAssets(join(resourcesApp, 'dist/renderer/index.html'))
    await assertReadable(join(resourcesApp, 'config.schema.json'), 'missing packaged config schema')
    await assertReadable(join(resourcesApp, 'agent-learningops.config.example.json'), 'missing packaged config example')
}

async function assertLocalRendererAssets(htmlPath: string): Promise<void> {
    const html = await readFile(htmlPath, 'utf8')
    const assetUrls = [...findAttributeValues(html, 'src'), ...findAttributeValues(html, 'href')]

    for (const assetUrl of assetUrls) {
        if (isIgnoredAssetUrl(assetUrl)) {
            continue
        }

        assert(!assetUrl.startsWith('/'), `${htmlPath} must not reference root-absolute asset URL: ${assetUrl}`)
        assert(!isRemoteOrDataUrl(assetUrl), `${htmlPath} must not reference non-local asset URL: ${assetUrl}`)

        const assetPath = resolveLocalAssetPath(htmlPath, assetUrl)
        await assertReadable(assetPath, `missing renderer asset referenced by ${htmlPath}: ${assetUrl}`)
    }
}

function findAttributeValues(html: string, attributeName: 'href' | 'src'): string[] {
    const attributePattern =
        attributeName === 'href' ? /\shref\s*=\s*["']([^"']+)["']/gi : /\ssrc\s*=\s*["']([^"']+)["']/gi
    return [...html.matchAll(attributePattern)].map((match) => match[1] ?? '')
}

function isIgnoredAssetUrl(url: string): boolean {
    return url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')
}

function isRemoteOrDataUrl(url: string): boolean {
    return /^(?:[a-z][a-z\d+.-]*:)?\/\//iu.test(url) || url.startsWith('data:')
}

function resolveLocalAssetPath(htmlPath: string, assetUrl: string): string {
    const htmlDirectoryUrl = pathToFileURL(`${dirname(htmlPath)}/`)
    return fileURLToPath(new URL(assetUrl, htmlDirectoryUrl))
}

async function assertReadable(path: string, message: string): Promise<void> {
    const stats = await stat(path)
    assert(stats.isFile(), message)
}

async function exists(path: string): Promise<boolean> {
    return access(path)
        .then(() => true)
        .catch(() => false)
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
    for (const path of paths) {
        if (await exists(path)) {
            return path
        }
    }

    return undefined
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message)
    }
}
