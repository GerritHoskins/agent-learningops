import type { Stats } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'

import type { LearningOpsConfig, PolicyTarget } from '../domain/schemas.js'
import { assertSafeRelativePath, readVerifiedRepositoryFile } from './repository-file.js'

export async function resolveTarget(
    repositoryRoot: string,
    config: LearningOpsConfig,
    targetId: string,
): Promise<PolicyTarget> {
    const target = config.targets.find((candidate) => candidate.id === targetId)
    if (!target) {
        throw new Error(`Unknown policy target: ${targetId}`)
    }

    assertSafeRelativePath(target.path)
    const root = await realpath(repositoryRoot)
    const targetPath = resolve(repositoryRoot, target.path)
    const targetDirectory = await realpath(dirname(targetPath))

    if (targetDirectory !== root && !targetDirectory.startsWith(`${root}${sep}`)) {
        throw new Error(`Target escapes repository root: ${target.path}`)
    }

    const stats = await statOptionalTarget(targetPath)
    if (!stats) {
        throw new Error(`Policy target does not exist: ${target.path}`)
    }
    if (stats.isSymbolicLink()) {
        throw new Error(`Symlink policy targets are rejected: ${target.path}`)
    }
    if (!stats.isFile()) {
        throw new Error(`Policy target is not a regular file: ${target.path}`)
    }

    return target
}

export async function readTargetContent(repositoryRoot: string, target: PolicyTarget): Promise<string> {
    await resolveTarget(
        repositoryRoot,
        {
            schemaVersion: 1,
            repositoryId: 'target-read',
            targets: [target],
            learningGlobs: [],
            proposalGlobs: [],
            receiptGlobs: [],
        },
        target.id,
    )
    return (await readVerifiedRepositoryFile(repositoryRoot, target.path)).content
}

async function statOptionalTarget(targetPath: string): Promise<Stats | undefined> {
    try {
        return await lstat(targetPath)
    } catch (error) {
        if (isMissingPathError(error)) {
            return undefined
        }

        throw error
    }
}

function isMissingPathError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
}
