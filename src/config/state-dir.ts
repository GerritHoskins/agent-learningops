import type { LearningOpsConfig } from '../domain/schemas.js'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { sha256Hex } from '../domain/ids.js'

export function resolveStateDirectory(config: LearningOpsConfig, repositoryRoot?: string): string {
    if (process.env.LEARNINGOPS_STATE_DIR) {
        return process.env.LEARNINGOPS_STATE_DIR
    }

    const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
    const repositoryKey = repositoryRoot
        ? `${config.repositoryId}-${sha256Hex(resolve(repositoryRoot)).slice(0, 16)}`
        : config.repositoryId
    return join(base, 'agent-learningops', repositoryKey)
}
