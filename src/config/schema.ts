import { type LearningOpsConfig, configSchema } from '../domain/schemas.js'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export async function findRepositoryRoot(
    startDirectory: string,
    configPath = 'agent-learningops.config.json',
): Promise<string> {
    let current = resolve(startDirectory)

    while (true) {
        const candidate = resolve(current, configPath)
        if (await exists(candidate)) {
            return current
        }

        const parent = dirname(current)
        if (parent === current) {
            throw new Error(`Could not find ${configPath} from ${startDirectory}`)
        }
        current = parent
    }
}

export async function loadConfig(
    repositoryRoot: string,
    configPath = 'agent-learningops.config.json',
): Promise<LearningOpsConfig> {
    const resolvedRoot = await findRepositoryRoot(repositoryRoot, configPath)
    const raw = await readFile(resolve(resolvedRoot, configPath), 'utf8')
    return configSchema.parse(JSON.parse(raw))
}

async function exists(path: string): Promise<boolean> {
    return access(path)
        .then(() => true)
        .catch(() => false)
}
