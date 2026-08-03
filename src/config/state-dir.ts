import type { LearningOpsConfig } from '../domain/schemas.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveStateDirectory(config: LearningOpsConfig): string {
    if (process.env.LEARNINGOPS_STATE_DIR) {
        return process.env.LEARNINGOPS_STATE_DIR
    }

    const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
    return join(base, 'agent-learningops', config.repositoryId)
}
