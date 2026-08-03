import { constants, type BigIntStats } from 'node:fs'
import { open, realpath, stat, type FileHandle } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export interface VerifiedRepositoryFile {
    relativePath: string
    absolutePath: string
    realPath: string
    content: string
    stats: BigIntStats
}

export interface VerifiedRepositoryReadOptions {
    openFile?: typeof open
    realpathFile?: typeof realpath
    statFile?: typeof stat
}

export async function readVerifiedRepositoryFile(
    repositoryRoot: string,
    relativePath: string,
    options: VerifiedRepositoryReadOptions = {},
): Promise<VerifiedRepositoryFile> {
    assertSafeRelativePath(relativePath)

    const openFile = options.openFile ?? open
    const realpathFile = options.realpathFile ?? realpath
    const statFile = options.statFile ?? stat
    const root = await realpathFile(repositoryRoot)
    const absolutePath = resolve(root, relativePath)
    assertInsideRepository(root, absolutePath, `Repository file escapes root: ${relativePath}`)

    const realPath = await realpathFile(absolutePath)
    assertInsideRepository(root, realPath, `Repository file escapes root: ${relativePath}`)

    let handle: FileHandle | undefined
    try {
        handle = await openFile(absolutePath, constants.O_RDONLY | noFollowFlag())
        const openedStats = await handle.stat({ bigint: true })
        if (!openedStats.isFile()) {
            throw new Error(`Repository path is not a regular file: ${relativePath}`)
        }

        const pathStats = await statFile(absolutePath, { bigint: true })
        if (!sameFileIdentity(openedStats, pathStats)) {
            throw new Error(`Repository file changed while being opened: ${relativePath}`)
        }

        const content = await handle.readFile('utf8')
        return {
            relativePath,
            absolutePath,
            realPath,
            content,
            stats: openedStats,
        }
    } finally {
        await handle?.close()
    }
}

export function assertSafeRelativePath(path: string): void {
    if (path.startsWith('/') || path.includes('..') || /[|;&$<>*?]/.test(path)) {
        throw new Error(`Unsafe repository-relative path: ${path}`)
    }
}

export function assertInsideRepository(repositoryRoot: string, candidate: string, message: string): void {
    if (candidate !== repositoryRoot && !candidate.startsWith(`${repositoryRoot}${sep}`)) {
        throw new Error(message)
    }
}

function noFollowFlag(): number {
    return typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
}

function sameFileIdentity(left: BigIntStats, right: BigIntStats): boolean {
    return left.dev === right.dev && left.ino === right.ino
}
