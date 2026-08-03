import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function isDirectExecution(moduleUrl: string, entryPath = process.argv[1]): boolean {
    return entryPath !== undefined && moduleUrl === pathToFileURL(resolve(entryPath)).href
}
