import { repositoryIdFromRoot } from '../domain/ids.js'
import type { LearningOpsConfig } from '../domain/schemas.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveStateDirectory(repositoryRoot: string, config: LearningOpsConfig): string {
    if (process.env.LEARNINGOPS_STATE_DIR) {
        return process.env.LEARNINGOPS_STATE_DIR
    }

    const repositoryKey = config.repositoryId || repositoryIdFromRoot(repositoryRoot)
    const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
    return join(base, 'agent-learningops', repositoryKey)
}
